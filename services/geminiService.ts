
import { BoardState, Color, Move, ROWS, COLS, PieceType } from '../types.ts';
import { getValidMoves } from '../utils/gameLogic.ts';

// Helper: Convert Board to FEN string
const boardToFen = (board: BoardState): string => {
    let fen = "";
    for (let y = 0; y < ROWS; y++) {
        let emptyCount = 0;
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (!p) {
                emptyCount++;
            } else {
                if (emptyCount > 0) {
                    fen += emptyCount;
                    emptyCount = 0;
                }
                let char = '';
                switch (p.type) {
                    case PieceType.GENERAL: char = 'k'; break;
                    case PieceType.ADVISOR: char = 'a'; break;
                    case PieceType.ELEPHANT: char = 'b'; break;
                    case PieceType.HORSE: char = 'n'; break;
                    case PieceType.CHARIOT: char = 'r'; break;
                    case PieceType.CANNON: char = 'c'; break;
                    case PieceType.SOLDIER: char = 'p'; break;
                }
                if (p.color === Color.RED) char = char.toUpperCase();
                fen += char;
            }
        }
        if (emptyCount > 0) {
            fen += emptyCount;
        }
        if (y < ROWS - 1) fen += "/";
    }
    fen += " b - - 0 1"; 
    return fen;
};

// Helper: Create a visual ASCII representation of the board
const boardToString = (board: BoardState): string => {
  let str = "   0 1 2 3 4 5 6 7 8\n";
  for (let y = 0; y < ROWS; y++) {
    str += `${y}  `;
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (!p) str += ". ";
      else {
        const c = p.color === Color.RED ? 'R' : 'B';
        const t = p.type.charAt(0).toUpperCase();
        str += `${c}${t}`;
      }
    }
    str += "\n";
  }
  return str;
};

// Helper: Explicitly list pieces for better spatial awareness
const getPieceList = (board: BoardState): string => {
    let list = "Active Pieces:\n";
    for (let y = 0; y < ROWS; y++) {
        for (let x = 0; x < COLS; x++) {
            const p = board[y][x];
            if (p) {
                const color = p.color === Color.RED ? "Red(Opponent)" : "Black(You)";
                list += `- ${color} ${p.type} at x:${x}, y:${y}\n`;
            }
        }
    }
    return list;
};

const callBackendAI = async (endpoint: string, prompt: string, allMoves: { move: Move }[]): Promise<Move | null> => {
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ prompt })
        });

        if (!res.ok) {
            const err = await res.json();
            throw new Error(err.error || "API failed");
        }
        
        const data = await res.json();
        let text = data.text || "";
        // Clean markdown
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        const jsonStart = text.indexOf('{');
        const jsonEnd = text.lastIndexOf('}');
        if (jsonStart !== -1 && jsonEnd !== -1) {
            text = text.substring(jsonStart, jsonEnd + 1);
        }

        const json = JSON.parse(text);
        const index = json.bestMoveIndex;

        if (typeof index === 'number' && index >= 0 && index < allMoves.length) {
            console.log(`AI Reasoning:`, json.reasoning);
            return allMoves[index].move;
        }
    } catch (e) {
        console.warn(`AI (${endpoint}) call failed:`, e);
    }
    return null;
};

export const getGeminiMove = async (board: BoardState): Promise<Move | null> => {
  const allMoves: { move: Move, notation: string, capture: boolean }[] = [];
  
  // Client-side move generation
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      const p = board[y][x];
      if (p && p.color === Color.BLACK) {
        const validDests = getValidMoves(board, { x, y });
        validDests.forEach(to => {
          const target = board[to.y][to.x];
          allMoves.push({
            move: { from: { x, y }, to },
            notation: `Index ${allMoves.length}: ${p.type} (${x},${y}) to (${to.x},${to.y})${target ? ' CAPTURE ' + target.type : ''}`,
            capture: !!target
          });
        });
      }
    }
  }

  if (allMoves.length === 0) return null;

  const fen = boardToFen(board);
  const visualBoard = boardToString(board);
  const pieceList = getPieceList(board);
  const movesStr = allMoves.map(m => m.notation).join('\n');
  
  // Advanced Prompt for Gemini 3 Pro with Thinking
  const prompt = `
    Role: You are the world's strongest Xiangqi (Chinese Chess) Grandmaster engine. 
    You are playing BLACK. Red is the opponent.
    
    Current Board State:
    FEN: ${fen}
    
    Visual Map (0,0 is Top-Left):
    ${visualBoard}
    
    ${pieceList}

    Valid Candidate Moves for Black:
    ${movesStr}

    TASK:
    Analyze the position deeply. Simulate future moves.
    
    TACTICAL PRIORITIES (Highest to Lowest):
    1. **CHECKMATE**: Can you checkmate Red immediately? If yes, DO IT.
    2. **SAVE THE KING**: Is your General in check? You MUST move out of check.
    3. **TACTICAL GAIN**: Look for:
       - **Forks**: Attacking two pieces at once.
       - **Pins**: Pinning a piece against the General or Chariot.
       - **Discovered Attacks**: Moving a piece to unblock an attack by a Chariot or Cannon.
    4. **MATERIAL**:
       - Capture Chariot (Value 9).
       - Capture Cannon/Horse (Value 4.5).
       - Do NOT trade a Chariot for a Horse/Cannon unless it leads to checkmate.
       - Do NOT give up a piece for free (Hanging piece).
    
    RESPONSE FORMAT (JSON ONLY):
    {
        "reasoning": "Detailed Chain-of-Thought... I analyzed move X, but Red replies with Y... Move Z allows me to control the river...",
        "bestMoveIndex": <Integer index from the Candidate Moves list>
    }
  `;

  // Use gemini endpoint
  const move = await callBackendAI('/api/gemini', prompt, allMoves);
  if (move) return move;

  // Fallback Heuristic if AI fails
  console.warn("AI failed, using heuristic fallback.");
  const valueMap: Record<string, number> = { 'general': 10000, 'chariot': 900, 'cannon': 450, 'horse': 400, 'advisor': 200, 'elephant': 200, 'soldier': 100 };
  let bestMove = allMoves[0].move;
  let maxScore = -99999;

  for (const m of allMoves) {
      let score = 0;
      const target = board[m.move.to.y][m.move.to.x];
      
      // Material
      if (target) score += (valueMap[target.type] || 0);

      // Center control for heavy pieces
      if ([PieceType.CHARIOT, PieceType.HORSE].includes(board[m.move.from.y][m.move.from.x]!.type)) {
          if (m.move.to.x >= 3 && m.move.to.x <= 5) score += 20;
      }
      
      // Random noise to prevent loops
      score += Math.random() * 10;

      if (score > maxScore) {
          maxScore = score;
          bestMove = m.move;
      }
  }

  return bestMove;
};
