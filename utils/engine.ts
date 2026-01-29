
import { BoardState, Color, Move, PieceType, ROWS, COLS } from '../types.ts';
import { getValidMoves, willBeChecked, PIECE_VALUES, isKingInDanger } from './gameLogic.ts';
import { PIECE_CHARS } from '../constants.ts';
import { getBookMove, getBookSuggestions } from './openingBook.ts';

// ================= 引擎配置 =================
const PVE_DEPTH = 5; // 由于引入了 TT，可以将深度提升到 5 甚至 6
const SUGGESTION_DEPTH = 3; 
const INFINITY = 999999;
const MATE_SCORE = 10000;

// ================= Zobrist Hashing 初始化 =================
// 棋盘状态哈希：10行 * 9列 * 14种棋子 (7红+7黑)
// side: 1 (Who's turn)
const ZOBRIST_TABLE: number[][][] = [];
let ZOBRIST_SIDE: number = 0;

const initZobrist = () => {
    if (ZOBRIST_TABLE.length > 0) return;
    
    // 生成随机 32 位整数 (JS Bitwise limit)
    const rand32 = () => Math.floor(Math.random() * 0xFFFFFFFF);

    for (let y = 0; y < ROWS; y++) {
        const row: number[][] = [];
        for (let x = 0; x < COLS; x++) {
            const pieces: number[] = [];
            for (let i = 0; i < 14; i++) { // 0-6: Red, 7-13: Black
                pieces.push(rand32());
            }
            row.push(pieces);
        }
        ZOBRIST_TABLE.push(row);
    }
    ZOBRIST_SIDE = rand32();
};

initZobrist();

const getPieceIndex = (p: { type: PieceType, color: Color }): number => {
    let idx = 0;
    switch (p.type) {
        case PieceType.GENERAL: idx = 0; break;
        case PieceType.ADVISOR: idx = 1; break;
        case PieceType.ELEPHANT: idx = 2; break;
        case PieceType.HORSE: idx = 3; break;
        case PieceType.CHARIOT: idx = 4; break;
        case PieceType.CANNON: idx = 5; break;
        case PieceType.SOLDIER: idx = 6; break;
    }
    if (p.color === Color.BLACK) idx += 7;
    return idx;
};

const computeHash = (board: BoardState, turn: Color): number => {
    let h = 0;
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p) {
                h ^= ZOBRIST_TABLE[y][x][getPieceIndex(p)];
            }
        }
    }
    if (turn === Color.BLACK) h ^= ZOBRIST_SIDE;
    return h; // 32-bit integer
};

// ================= Transposition Table (TT) =================
// Map<Hash, { depth, score, flag, bestMove }>
// flag: 0=Exact, 1=LowerBound(Alpha), 2=UpperBound(Beta)
const TT = new Map<number, { depth: number, score: number, flag: number, bestMove?: Move }>();

// 限制 TT 大小，防止内存溢出
const cleanTT = () => {
    if (TT.size > 200000) TT.clear();
};

// ================= 历史启发表 =================
const historyTable: number[][][][] = Array(ROWS).fill(0).map(() => 
    Array(COLS).fill(0).map(() => 
        Array(ROWS).fill(0).map(() => Array(COLS).fill(0))
    )
);

const resetHistory = () => {
    for(let y=0; y<ROWS; y++) 
        for(let x=0; x<COLS; x++) 
            for(let ty=0; ty<ROWS; ty++) 
                historyTable[y][x][ty].fill(0);
};

// ================= PST (位置价值表) - 保持不变 =================
const PAWN_PST = [
    [  0,  0,  0, 10, 20, 10,  0,  0,  0], 
    [ 20, 20, 30, 40, 50, 40, 30, 20, 20], 
    [ 20, 20, 30, 40, 50, 40, 30, 20, 20], 
    [ 10, 10, 20, 30, 40, 30, 20, 10, 10], 
    [ 10, 10, 20, 30, 30, 30, 20, 10, 10], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
];

const ROOK_PST = [
    [ 10, 10, 10, 10, 10, 10, 10, 10, 10], 
    [ 10, 20, 20, 20, 20, 20, 20, 20, 10], 
    [  0, 10, 10, 10, 10, 10, 10, 10,  0], 
    [  0, 10, 10, 10, 10, 10, 10, 10,  0], 
    [  0, 10, 10, 10, 10, 10, 10, 10,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0, 10,  0, 10,  0, 10,  0, 10,  0], 
    [ -5, 10,  0,  5,  0,  5,  0, 10, -5], 
];

const HORSE_PST = [
    [  0, -5,  0,  0,  0,  0,  0, -5,  0], 
    [  0,  0,  0,  5,  5,  5,  0,  0,  0], 
    [ 10, 10, 20, 30, 40, 30, 20, 10, 10], 
    [  5,  5, 10, 20, 20, 20, 10,  5,  5], 
    [  5,  5, 10, 10, 10, 10, 10,  5,  5], 
    [  5,  5, 10, 10, 10, 10, 10,  5,  5], 
    [  0,  5,  5,  5,  5,  5,  5,  5,  0], 
    [  0,  0,  5,  0,  0,  0,  5,  0,  0], 
    [ -5,  0,  0,  0,  0,  0,  0,  0, -5], 
    [ -5, -5, -5, -5, -5, -5, -5, -5, -5], 
];

const CANNON_PST = [
    [ 10, 10, 10, 10, 10, 10, 10, 10, 10], 
    [ 10, 10, 10, 10, 10, 10, 10, 10, 10], 
    [ 20, 20, 20, 30, 40, 30, 20, 20, 20], 
    [ 10, 10, 10, 10, 10, 10, 10, 10, 10], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [ 10,  0, 20,  0, 10,  0, 20,  0, 10], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
    [  0,  0,  0,  0,  0,  0,  0,  0,  0], 
];

// ================= 评估函数 =================
const evaluateBoard = (board: BoardState, turn: Color): number => {
    let redScore = 0;
    let blackScore = 0;

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (!p) continue;
            
            let score = PIECE_VALUES[p.type];
            let pstVal = 0;
            const r = p.color === Color.RED ? y : 9 - y;
            const c = x; 
            switch (p.type) {
                case PieceType.SOLDIER: pstVal = PAWN_PST[r][c]; break;
                case PieceType.CHARIOT: pstVal = ROOK_PST[r][c]; break;
                case PieceType.HORSE: pstVal = HORSE_PST[r][c]; break;
                case PieceType.CANNON: pstVal = CANNON_PST[r][c]; break;
                case PieceType.GENERAL: if(c===4) pstVal = 10; break; 
            }
            score += pstVal;
            if (p.type === PieceType.CHARIOT || p.type === PieceType.HORSE) {
                score += 5; // 机动性补偿
            }
            if (p.color === Color.RED) redScore += score;
            else blackScore += score;
        }
    }
    const turnBonus = 10; // 先手优势
    return turn === Color.RED 
        ? (redScore - blackScore + turnBonus) 
        : (blackScore - redScore + turnBonus);
};

// ================= 走法生成与排序 =================
const getAllLegalMoves = (board: BoardState, color: Color, ttMove?: Move): { move: Move, score: number }[] => {
    const moves: { move: Move, score: number }[] = [];
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.color === color) {
                const dests = getValidMoves(board, { x, y });
                for (const to of dests) {
                    if (!willBeChecked(board, { from: {x, y}, to }, color)) {
                        const target = board[to.y][to.x];
                        let sortScore = 0;
                        if (target) {
                            sortScore = 10000 + PIECE_VALUES[target.type] * 10 - PIECE_VALUES[p.type];
                        }
                        sortScore += historyTable[y][x][to.y][to.x];
                        
                        // Hash Move Heuristic
                        if (ttMove && ttMove.from.x === x && ttMove.from.y === y && ttMove.to.x === to.x && ttMove.to.y === to.y) {
                            sortScore += 200000; // 确保 Hash Move 排第一
                        }

                        moves.push({ move: { from: {x,y}, to }, score: sortScore });
                    }
                }
            }
        }
    }
    return moves.sort((a, b) => b.score - a.score);
};

// ================= 搜索核心 =================
const quiescenceSearch = (board: BoardState, alpha: number, beta: number, turn: Color): number => {
    const standPat = evaluateBoard(board, turn);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    const moves = getAllLegalMoves(board, turn).filter(m => board[m.move.to.y][m.move.to.x] !== null);
    
    for (const { move } of moves) {
        const fromP = board[move.from.y][move.from.x];
        const toP = board[move.to.y][move.to.x];
        board[move.to.y][move.to.x] = fromP;
        board[move.from.y][move.from.x] = null;
        
        const score = -quiescenceSearch(board, -beta, -alpha, turn === Color.RED ? Color.BLACK : Color.RED);
        
        board[move.from.y][move.from.x] = fromP;
        board[move.to.y][move.to.x] = toP;
        
        if (score >= beta) return beta;
        if (score > alpha) alpha = score;
    }
    return alpha;
};

const alphaBeta = (board: BoardState, depth: number, alpha: number, beta: number, turn: Color): number => {
    // 1. TT Lookup
    const hash = computeHash(board, turn);
    const ttEntry = TT.get(hash);
    if (ttEntry && ttEntry.depth >= depth) {
        if (ttEntry.flag === 0) return ttEntry.score; // Exact
        if (ttEntry.flag === 1 && ttEntry.score >= beta) return ttEntry.score; // LowerBound >= Beta -> Cutoff
        if (ttEntry.flag === 2 && ttEntry.score <= alpha) return ttEntry.score; // UpperBound <= Alpha -> Cutoff
    }

    if (depth <= 0) return quiescenceSearch(board, alpha, beta, turn);
    
    // 2. Generate Moves (Ordered)
    const moves = getAllLegalMoves(board, turn, ttEntry?.bestMove);
    if (moves.length === 0) return -MATE_SCORE + depth;

    let flag = 2; // UpperBound
    let bestMove: Move | undefined = undefined;

    for (const { move } of moves) {
        const fromP = board[move.from.y][move.from.x];
        const toP = board[move.to.y][move.to.x];
        board[move.to.y][move.to.x] = fromP;
        board[move.from.y][move.from.x] = null;
        
        const val = -alphaBeta(board, depth - 1, -beta, -alpha, turn === Color.RED ? Color.BLACK : Color.RED);
        
        board[move.from.y][move.from.x] = fromP;
        board[move.to.y][move.to.x] = toP;
        
        if (val >= beta) {
            historyTable[move.from.y][move.from.x][move.to.y][move.to.x] += depth * depth;
            // Store LowerBound
            TT.set(hash, { depth, score: beta, flag: 1, bestMove: move });
            return beta;
        }
        if (val > alpha) {
            alpha = val;
            flag = 0; // Exact
            bestMove = move;
        }
    }

    // Store Exact or UpperBound
    TT.set(hash, { depth, score: alpha, flag, bestMove });
    return alpha;
};

// ================= 分析功能 =================
// (复用之前的 analyzeTactic 和 getMoveName)
const analyzeTactic = (board: BoardState, move: Move, score: number): string => {
    // ... 代码同上 ...
    // 为了节省空间，此处省略部分重复代码，核心逻辑与之前一致
    // 但为了确保代码完整性，这里必须写上
    const fromP = board[move.from.y][move.from.x];
    const toP = board[move.to.y][move.to.x];
    
    const tempBoard = board.map(r => r.map(c => c ? {...c} : null));
    tempBoard[move.to.y][move.to.x] = tempBoard[move.from.y][move.from.x];
    tempBoard[move.from.y][move.from.x] = null;
    
    const enemyColor = fromP!.color === Color.RED ? Color.BLACK : Color.RED;
    const isCheck = isKingInDanger(tempBoard, enemyColor);
    
    let threatText = "";
    if (!toP) {
        const attacks = getValidMoves(tempBoard, move.to);
        for (const atk of attacks) {
            const target = tempBoard[atk.y][atk.x];
            if (target && target.color === enemyColor) {
                if (target.type === PieceType.CHARIOT) threatText = "捉车";
                else if (target.type === PieceType.CANNON && !threatText) threatText = "捉炮";
                else if (target.type === PieceType.HORSE && !threatText) threatText = "捉马";
            }
        }
    }

    if (toP) {
        const val = PIECE_VALUES[toP.type];
        if (val >= 900) return isCheck ? "吃车将军！" : "吃车，胜势";
        if (val >= 400) return isCheck ? `吃${PIECE_CHARS[toP.type][0]}将军` : `吃${PIECE_CHARS[toP.type][0]}得子`;
        return isCheck ? "吃子将军" : `吃${PIECE_CHARS[toP.type][0]}`;
    }

    if (isCheck && threatText) return `${threatText}将军`;
    if (isCheck) return score > 2000 ? "绝杀！" : "将军";
    if (threatText) return `${threatText}，抢先手`;
    if (score > 500) return "优势推进";
    return "稳健运子";
};

export const getMoveName = (board: BoardState, move: Move): string => {
    // ... 代码同上 ...
    const p = board[move.from.y][move.from.x];
    if (!p) return "";
    const getCol = (x: number, c: Color) => c === Color.RED ? (9 - x) : (x + 1);
    const colName = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
    const numName = ["", "1", "2", "3", "4", "5", "6", "7", "8", "9"];
    const isRed = p.color === Color.RED;
    const fromColIdx = getCol(move.from.x, p.color);
    const toColIdx = getCol(move.to.x, p.color);
    const pieceChar = isRed ? PIECE_CHARS[p.type][0] : PIECE_CHARS[p.type][1];
    const fromStr = isRed ? colName[fromColIdx] : numName[fromColIdx];
    let dirStr = "";
    let destStr = "";
    const dy = isRed ? (move.from.y - move.to.y) : (move.to.y - move.from.y);
    const absDy = Math.abs(move.from.y - move.to.y);
    if (dy > 0) dirStr = "进";
    else if (dy < 0) dirStr = "退";
    else dirStr = "平";
    if ([PieceType.HORSE, PieceType.ELEPHANT, PieceType.ADVISOR].includes(p.type) || dirStr === "平") {
         destStr = isRed ? colName[toColIdx] : numName[toColIdx];
    } else {
         destStr = isRed ? colName[absDy] : numName[absDy];
    }
    return `${pieceChar}${fromStr}${dirStr}${destStr}`;
};

// ================= API: AI 军师 (获取 Top N 建议) =================
export const getTopMoves = (board: BoardState, turn: Color, limit: number = 3): { move: Move, score: number, desc: string, notation: string }[] => {
    // 军师模式下不重置 TT，利用已有知识
    // cleanTT(); 
    
    const tempBoard = board.map(row => row.map(p => p ? {...p} : null));
    const candidates = [];
    
    const bookSuggestions = getBookSuggestions(board, turn);
    for (const bookEntry of bookSuggestions) {
        const move: Move = { 
            from: { x: bookEntry.move.from[0], y: bookEntry.move.from[1] }, 
            to: { x: bookEntry.move.to[0], y: bookEntry.move.to[1] } 
        };
        const notation = getMoveName(board, move);
        candidates.push({ 
            move, 
            score: 99999,
            desc: `【大师亲授】${bookEntry.desc} (${bookEntry.name})`, 
            notation 
        });
    }

    if (candidates.length < limit) {
        const moves = getAllLegalMoves(tempBoard, turn);
        if (moves.length > 0) {
            const searchCount = Math.min(moves.length, 8);
            for (let i = 0; i < searchCount; i++) {
                const { move } = moves[i];
                const isBookMove = candidates.some(c => c.move.from.x === move.from.x && c.move.from.y === move.from.y && c.move.to.x === move.to.x && c.move.to.y === move.to.y);
                if (isBookMove) continue;

                const fromP = tempBoard[move.from.y][move.from.x];
                const toP = tempBoard[move.to.y][move.to.x];
                tempBoard[move.to.y][move.to.x] = fromP;
                tempBoard[move.from.y][move.from.x] = null;
                
                const score = -alphaBeta(tempBoard, SUGGESTION_DEPTH - 1, -INFINITY, INFINITY, turn === Color.RED ? Color.BLACK : Color.RED);
                
                tempBoard[move.from.y][move.from.x] = fromP;
                tempBoard[move.to.y][move.to.x] = toP;
                
                const notation = getMoveName(board, move);
                const desc = analyzeTactic(board, move, score);
                candidates.push({ move, score, desc, notation });
            }
        }
    }
    
    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
};

// ================= API: PVE 最佳着法 (使用 TT 加速) =================
export const searchBestMove = (board: BoardState, turn: Color): Move | null => {
    // 1. 查阅开局库
    const bookMove = getBookMove(board, turn);
    if (bookMove) {
        console.log(`[Book] Playing ${bookMove.name}: ${bookMove.desc}`);
        return { 
            from: { x: bookMove.move.from[0], y: bookMove.move.from[1] }, 
            to: { x: bookMove.move.to[0], y: bookMove.move.to[1] } 
        };
    }

    cleanTT(); // 清理过旧的哈希
    resetHistory(); // 重置历史表 (适应新局面)
    
    const tempBoard = board.map(row => row.map(p => p ? {...p} : null));
    let bestMove: Move | null = null;
    let moves = getAllLegalMoves(tempBoard, turn);
    if (moves.length === 0) return null;

    // 迭代加深
    for (let depth = 2; depth <= PVE_DEPTH; depth++) {
        let bestScore = -INFINITY;
        let alpha = -INFINITY;
        let beta = INFINITY;
        
        // 重新排序 moves，这次利用 TT 中的 bestMove
        const hash = computeHash(tempBoard, turn);
        const ttEntry = TT.get(hash);
        moves = getAllLegalMoves(tempBoard, turn, ttEntry?.bestMove);

        for (const { move } of moves) {
            const fromP = tempBoard[move.from.y][move.from.x];
            const toP = tempBoard[move.to.y][move.to.x];
            tempBoard[move.to.y][move.to.x] = fromP;
            tempBoard[move.from.y][move.from.x] = null;

            const val = -alphaBeta(tempBoard, depth - 1, -beta, -alpha, turn === Color.RED ? Color.BLACK : Color.RED);

            tempBoard[move.from.y][move.from.x] = fromP;
            tempBoard[move.to.y][move.to.x] = toP;

            if (val > bestScore) {
                bestScore = val;
                bestMove = move;
            }
            if (val > alpha) alpha = val;
        }
    }
    return bestMove;
};

// ================= API: 后台思考 (Pondering) =================
// 供空闲时调用，提前填充 TT
export const ponder = async (board: BoardState, turn: Color) => {
    const tempBoard = board.map(row => row.map(p => p ? {...p} : null));
    // 仅进行 2-3 层的浅层搜索来预热 TT
    const PONDER_DEPTH = 3;
    alphaBeta(tempBoard, PONDER_DEPTH, -INFINITY, INFINITY, turn);
};
