# 3D Breakout

A small Breakout game rendered with three.js (loaded from jsDelivr through an
import map), so it runs by opening `index.html` in a browser - no build step,
no npm, no server. Paths are relative, so it works when hosted under a sub-path.

Controls

- Left / Right arrows or A / D - move the paddle.
- Space - start, serve after a lost ball, restart after a win or game over.
- Clicking the field does the same as Space.

Rules

- 48 bricks in a 6 x 8 grid, 7 points each. Clear them all to win.
- 3 lives; a ball that gets past the paddle costs one.
- The angle the ball leaves the paddle at depends on how far off centre it hits
  (a centre hit goes straight back, an edge hit goes off at up to about 45 degrees).

How it works

- `main.js` creates the canvas, the render loop and the fps readout.
- `js/game.js` holds the scene: a perspective camera looking down at the field at
  an angle and following the ball, one shadow-casting directional light plus an
  ambient light, and an UnrealBloomPass for a bit of glow. It also runs the state
  machine (start, play, ball lost, game over, win).
- `js/entities.js` builds the meshes: brick boxes, box walls and floor, a box
  paddle and a sphere ball.
- `js/collision.js` steps the ball with sub-steps (so it cannot tunnel through a
  brick) and resolves hits against the bricks, the side walls, the far wall, the
  paddle and the open front of the field, where a miss means a lost life.
- `js/input.js` tracks the held keys and the Space press.
- `js/ui.js` writes the score, lives, bricks left and the status message into the
  HTML overlay (`index.html` + `styles.css`).
