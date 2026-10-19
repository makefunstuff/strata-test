// Level data: a 15 x 11 tile maze. Each character is one tile.
//   #  wall block      .  floor      H  hole in the board (the marble falls through)
//   S  start tile      G  goal pad   O  opening in the edge wall (the marble falls off the board)
export const MAP = [
  "###############",
  "#.#.#.#...#..S#",
  "#......#.#H..##",
  "#...#...#...#.#",
  "##.#.#.#..##..O",
  "#...#...#...#.#",
  "#..###H..#H...#",
  "#.....#H....#.#",
  "#...#.##.###.##",
  "#G#.#.#.#.#...#",
  "###############",
];

export const COLS = MAP[0].length;
export const ROWS = MAP.length;

export const TILE = 0.2;      // tile size in metres
export const BOARD_T = 0.03;  // board thickness
export const WALL_H = 0.13;   // wall block height
export const MARBLE_R = 0.045;
export const MAX_TILT = 12 * Math.PI / 180; // max board tilt (radians)

export const START = [13, 1];   // top-right corner
export const GOAL = [1, 9];    // bottom-left corner

export function charAt(col, row) {
  return MAP[row] && MAP[row][col] ? MAP[row][col] : "#";
}

// Board-local coordinates (board plane, y = up, origin at board centre).
export function local(col, row) {
  return { x: (col - (COLS - 1) / 2) * TILE, z: (row - (ROWS - 1) / 2) * TILE };
}

// Group contiguous floor tiles into runs (one collision body / one mesh each),
// so holes really are gaps the marble can drop through.
export function parse() {
  const floor = [], walls = [], holes = [], gaps = [];
  for (let row = 0; row < ROWS; row++) {
    let runStart = -1;
    for (let col = 0; col <= COLS; col++) {
      const ch = col < COLS ? charAt(col, row) : "#";
      const isFloor = ch === "." || ch === "S" || ch === "G";
      if (isFloor) { if (runStart < 0) runStart = col; continue; }
      if (runStart >= 0) { floor.push({ row, col0: runStart, col1: col - 1 }); runStart = -1; }
      if (ch === "#") walls.push({ col, row });
      else if (ch === "H") holes.push({ col, row });
      else if (ch === "O") gaps.push({ col, row });
    }
  }
  return { floor, walls, holes, gaps };
}
