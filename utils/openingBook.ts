
import { Move, Position } from '../types.ts';

interface BookEntry {
    move: { from: [number, number], to: [number, number] }; // [x, y]
    name: string; // 布局名称
    desc: string; // 战术意图
    score: number; // 推荐分数
}

// 辅助函数：生成精简版 FEN (只看棋盘和轮次)
export const getSimpifiedFen = (board: any[][], turn: string): string => {
    let fen = "";
    for (let y = 0; y < 10; y++) {
        let empty = 0;
        for (let x = 0; x < 9; x++) {
            const p = board[y][x];
            if (!p) {
                empty++;
            } else {
                if (empty > 0) { fen += empty; empty = 0; }
                let c = p.type === 'horse' ? 'n' : 
                        p.type === 'chariot' ? 'r' : 
                        p.type === 'elephant' ? 'b' : 
                        p.type === 'advisor' ? 'a' : 
                        p.type === 'general' ? 'k' : 
                        p.type === 'cannon' ? 'c' : 'p';
                if (p.color === 'red') c = c.toUpperCase();
                fen += c;
            }
        }
        if (empty > 0) fen += empty;
        if (y < 9) fen += "/";
    }
    return `${fen} ${turn === 'red' ? 'w' : 'b'}`;
};

// ==================== 大师棋谱库 (扩展版) ====================
const OPENING_BOOK: Record<string, BookEntry[]> = {
    // 1. 初始局面 (Red to move)
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/9/RNBAKABNR w": [
        { move: { from: [7, 7], to: [4, 7] }, name: "中炮局 (Central Cannon)", desc: "当头炮，把马跳。控制中路，其实力最强。", score: 100 },
        { move: { from: [2, 9], to: [4, 7] }, name: "飞相局 (Elephant Opening)", desc: "扬相护底，稳健防守，以柔克刚。", score: 95 },
        { move: { from: [2, 6], to: [2, 5] }, name: "仙人指路 (Angel's Guide)", desc: "进兵试探，投石问路，可演变为多种阵型。", score: 92 },
        { move: { from: [1, 9], to: [2, 7] }, name: "起马局 (Horse Opening)", desc: "进马开局，灵活多变，不急于表态。", score: 90 }
    ],

    // 2. 黑方应对当头炮 (Black to move)
    // 局面：红方炮二平五后 (rnbakabnr/9/1c5c1/p1p1p1p1p/9/4C4/P1P1P1P1P/1C7/9/RNBAKABNR b)
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4C4/P1P1P1P1P/1C7/9/RNBAKABNR b": [
        { move: { from: [1, 0], to: [2, 2] }, name: "屏风马 (Screen Horses)", desc: "马8进7，防御中炮最正统的走法，弹性极佳。", score: 100 },
        { move: { from: [7, 0], to: [6, 2] }, name: "反宫马 (Sandwich Horses)", desc: "马2进3，侧重反击，套路较深，内藏飞刀。", score: 95 },
        { move: { from: [1, 2], to: [4, 2] }, name: "顺手炮 (Same Direction Cannons)", desc: "你打我也打，对攻激烈，容易形成乱战。", score: 90 },
        { move: { from: [7, 2], to: [4, 2] }, name: "列手炮 (Opposite Cannons)", desc: "针锋相对，半途列炮，局势复杂。", score: 88 }
    ],

    // 3. 黑方应对飞相局 (Black to move)
    // 局面：红方相三进五 (rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4B4/RNBAK1BNR b)
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/9/P1P1P1P1P/1C5C1/4B4/RNBAK1BNR b": [
        { move: { from: [1, 0], to: [2, 2] }, name: "进正马", desc: "堂堂正正，以静制动。", score: 95 },
        { move: { from: [1, 2], to: [4, 2] }, name: "左中炮", desc: "针对红方中路薄弱，架起中炮施压。", score: 95 },
        { move: { from: [2, 3], to: [2, 4] }, name: "挺卒制马", desc: "挺3卒限制红方马路，争夺先手。", score: 92 }
    ],

    // 4. 红中炮，黑屏风马 (Red to move)
    // 局面：rnbakab1r/9/1c2c1/p1p1p1p1p/9/4C4/P1P1P1P1P/1C7/9/RNBAKABNR w
    "rnbakab1r/9/1c2c1/p1p1p1p1p/9/4C4/P1P1P1P1P/1C7/9/RNBAKABNR w": [
         { move: { from: [1, 9], to: [2, 7] }, name: "正马护中", desc: "马二进三，保护中兵，正常出子。", score: 100 },
         { move: { from: [2, 6], to: [2, 5] }, name: "进七兵", desc: "进七兵疏通马路，压制黑方右翼。", score: 95 }
    ],
    
    // 5. 红中炮，黑顺炮 (Red to move)
    // 局面：rnbakabnr/9/1c5c1/p1p1p1p1p/9/4C1C2/P1P1P1P1P/9/9/RNBAKABNR w
    "rnbakabnr/9/1c5c1/p1p1p1p1p/9/4C1C2/P1P1P1P1P/9/9/RNBAKABNR w": [
        { move: { from: [1, 9], to: [2, 7] }, name: "跳正马", desc: "顺炮直车对横车，经典攻杀。", score: 100 }
    ],
    
    // 6. 弃马陷阱 (Black to move) - 模拟一个经典的中局陷阱
    // 假设红方贪吃中卒
};

export const getBookMove = (board: any[][], turn: string): BookEntry | null => {
    const fen = getSimpifiedFen(board, turn);
    const moves = OPENING_BOOK[fen];
    if (moves && moves.length > 0) {
        // 90% 概率走最高分，10% 概率走变着
        const random = Math.random();
        if (random > 0.9 && moves.length > 1) {
            return moves[1];
        }
        return moves[0];
    }
    return null;
};

export const getBookSuggestions = (board: any[][], turn: string): BookEntry[] => {
    const fen = getSimpifiedFen(board, turn);
    return OPENING_BOOK[fen] || [];
};
