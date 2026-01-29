
import { BoardState, Color, Move, PieceType, ROWS, COLS } from '../types.ts';
import { getValidMoves, willBeChecked, PIECE_VALUES, isKingInDanger } from './gameLogic.ts';
import { PIECE_CHARS } from '../constants.ts';

// ================= 引擎配置 =================
const PVE_DEPTH = 4; // PVE 思考深度 (可尝试 5，但 JS 单线程需考虑性能)
const SUGGESTION_DEPTH = 3; // 军师建议深度
const INFINITY = 999999;
const MATE_SCORE = 10000;

// ================= 历史启发表 (History Heuristic) =================
// 记录好棋，用于排序优化: historyTable[fromY][fromX][toY][toX]
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

// ================= PST (位置价值表) =================
// 保持原有 PST 定义，确保 AI 懂得基础阵型
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

// ================= 评估函数 (增强版) =================
const evaluateBoard = (board: BoardState, turn: Color): number => {
    let redScore = 0;
    let blackScore = 0;

    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (!p) continue;
            
            // 1. 基础子力
            let score = PIECE_VALUES[p.type];

            // 2. 位置分 PST
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

            // 3. 机动性加分 (Mobility)
            // 简单的机动性计算，避免过于耗时：车马炮如果在原位不动扣分，如果位置好加分
            // 真正的机动性需要调用 getValidMoves，这里为了性能简化处理
            if (p.type === PieceType.CHARIOT || p.type === PieceType.HORSE) {
                score += 5; // 存活的强子本身就有威慑力
            }

            if (p.color === Color.RED) redScore += score;
            else blackScore += score;
        }
    }
    
    // 4. 谁轮到谁走，谁有微弱的主动权分
    const turnBonus = 10;
    
    return turn === Color.RED 
        ? (redScore - blackScore + turnBonus) 
        : (blackScore - redScore + turnBonus);
};

// ================= 走法生成与排序 =================
const getAllLegalMoves = (board: BoardState, color: Color): { move: Move, score: number }[] => {
    const moves: { move: Move, score: number }[] = [];
    
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p && p.color === color) {
                const dests = getValidMoves(board, { x, y });
                for (const to of dests) {
                    // 必须是严格合法 (不送将)
                    if (!willBeChecked(board, { from: {x, y}, to }, color)) {
                        const target = board[to.y][to.x];
                        let sortScore = 0;
                        
                        // MVV-LVA: 吃子优先
                        if (target) {
                            sortScore = 10000 + PIECE_VALUES[target.type] * 10 - PIECE_VALUES[p.type];
                        }
                        
                        // 历史启发: 使用历史表中的分数
                        sortScore += historyTable[y][x][to.y][to.x];

                        moves.push({ move: { from: {x,y}, to }, score: sortScore });
                    }
                }
            }
        }
    }
    // 降序排列
    return moves.sort((a, b) => b.score - a.score);
};

// ================= 搜索核心: Alpha-Beta + Quiescence =================

const quiescenceSearch = (board: BoardState, alpha: number, beta: number, turn: Color): number => {
    const standPat = evaluateBoard(board, turn);
    if (standPat >= beta) return beta;
    if (alpha < standPat) alpha = standPat;

    // 静态搜索只生成吃子步
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
    // 检查将军：如果被将军，必须延伸搜索深度，防止计算不到位
    // 暂略延伸逻辑以保性能
    
    if (depth <= 0) return quiescenceSearch(board, alpha, beta, turn);
    
    const moves = getAllLegalMoves(board, turn);
    if (moves.length === 0) return -MATE_SCORE + depth; // 困毙/被杀，输得越晚越好

    let bestScore = -INFINITY;

    for (const { move } of moves) {
        const fromP = board[move.from.y][move.from.x];
        const toP = board[move.to.y][move.to.x];
        
        board[move.to.y][move.to.x] = fromP;
        board[move.from.y][move.from.x] = null;
        
        const val = -alphaBeta(board, depth - 1, -beta, -alpha, turn === Color.RED ? Color.BLACK : Color.RED);
        
        board[move.from.y][move.from.x] = fromP;
        board[move.to.y][move.to.x] = toP;
        
        if (val >= beta) {
            // 历史启发: 记录这步好棋
            historyTable[move.from.y][move.from.x][move.to.y][move.to.x] += depth * depth;
            return beta; // Cut-off
        }
        if (val > alpha) {
            alpha = val;
            bestScore = val;
        }
    }
    return alpha;
};

// ================= 分析功能：检测战术意图 =================
const analyzeTactic = (board: BoardState, move: Move, score: number): string => {
    const fromP = board[move.from.y][move.from.x];
    const toP = board[move.to.y][move.to.x];
    
    // 1. 模拟走棋
    const tempBoard = board.map(r => r.map(c => c ? {...c} : null));
    tempBoard[move.to.y][move.to.x] = tempBoard[move.from.y][move.from.x];
    tempBoard[move.from.y][move.from.x] = null;
    
    // 2. 检查是否叫杀 (Check)
    const enemyColor = fromP!.color === Color.RED ? Color.BLACK : Color.RED;
    const isCheck = isKingInDanger(tempBoard, enemyColor);
    
    // 3. 检查是否捉吃大子 (Threat)
    // 简单看下一层，有没有大子在攻击范围内
    let threatText = "";
    if (!toP) { // 只有不吃子的时候才判断捉子，吃子本身就是理由
        // 获取这步棋之后，这个棋子能攻击到的位置
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

    // 组合描述
    if (toP) {
        const val = PIECE_VALUES[toP.type];
        if (val >= 900) return isCheck ? "吃车将军！" : "吃车，胜势";
        if (val >= 400) return isCheck ? `吃${PIECE_CHARS[toP.type][0]}将军` : `吃${PIECE_CHARS[toP.type][0]}得子`;
        return isCheck ? "吃子将军" : `吃${PIECE_CHARS[toP.type][0]}`;
    }

    if (isCheck && threatText) return `${threatText}将军`;
    if (isCheck) return score > 2000 ? "绝杀！" : "将军";
    if (threatText) return `${threatText}，抢先手`;
    
    // 布局描述
    if (fromP?.type === PieceType.CANNON && move.to.x === 4) return "中炮镇中";
    if (fromP?.type === PieceType.HORSE && (move.to.x === 4 || move.to.x === 6)) return "跃马盘头";
    if (fromP?.type === PieceType.CHARIOT && move.to.y === 4 && fromP.color === Color.RED) return "霸王车巡河";
    
    if (score > 500) return "优势推进";
    return "稳健运子";
};

// ================= API: AI 军师 (获取 Top N 建议) =================
export const getTopMoves = (board: BoardState, turn: Color, limit: number = 3): { move: Move, score: number, desc: string, notation: string }[] => {
    resetHistory(); // 每次思考前重置历史表的一部分? 或者保留? PVE保留, 军师重置以防干扰
    
    // 深拷贝
    const tempBoard = board.map(row => row.map(p => p ? {...p} : null));
    
    // 获取候选步
    const moves = getAllLegalMoves(tempBoard, turn);
    if (moves.length === 0) return [];

    const candidates = [];
    const searchCount = Math.min(moves.length, 12); // 稍微多算几个候选
    
    for (let i = 0; i < searchCount; i++) {
        const { move } = moves[i];
        
        // 模拟
        const fromP = tempBoard[move.from.y][move.from.x];
        const toP = tempBoard[move.to.y][move.to.x];
        tempBoard[move.to.y][move.to.x] = fromP;
        tempBoard[move.from.y][move.from.x] = null;
        
        // 使用 AlphaBeta 搜索评分
        // 军师模式深度 SUGGESTION_DEPTH (3)
        const score = -alphaBeta(tempBoard, SUGGESTION_DEPTH - 1, -INFINITY, INFINITY, turn === Color.RED ? Color.BLACK : Color.RED);
        
        // 撤销
        tempBoard[move.from.y][move.from.x] = fromP;
        tempBoard[move.to.y][move.to.x] = toP;
        
        const notation = getMoveName(board, move);
        const desc = analyzeTactic(board, move, score); // 使用增强版描述
        
        candidates.push({ move, score, desc, notation });
    }
    
    return candidates.sort((a, b) => b.score - a.score).slice(0, limit);
};

// ================= API: PVE 最佳着法 (使用迭代加深) =================
export const searchBestMove = (board: BoardState, turn: Color): Move | null => {
    resetHistory();
    const tempBoard = board.map(row => row.map(p => p ? {...p} : null));
    
    // 迭代加深 (Iterative Deepening)
    // 先搜 2 层，再搜 3 层...直到 MAX_DEPTH
    // 这样可以利用浅层搜索的结果(历史启发)来加速深层搜索
    
    let bestMove: Move | null = null;
    let moves = getAllLegalMoves(tempBoard, turn);
    if (moves.length === 0) return null;

    // 初始排序
    
    for (let depth = 2; depth <= PVE_DEPTH; depth++) {
        let bestScore = -INFINITY;
        let alpha = -INFINITY;
        let beta = INFINITY;
        
        // 每一层开始前，如果已经有上一层的 bestMove，可以尝试把它排在第一位(TODO: 简单实现暂略)
        // 由于我们有 historyTable，上一层搜索填充了 historyTable，所以再次调用 getAllLegalMoves 排序会变好
        moves = getAllLegalMoves(tempBoard, turn); 

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
            if (val > alpha) {
                alpha = val;
            }
        }
    }

    return bestMove;
};

// ================= 辅助函数：生成中文招法名称 (如：炮二平五) =================
export const getMoveName = (board: BoardState, move: Move): string => {
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
