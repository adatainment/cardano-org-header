# cardano-org Header

3D WebGL force-directed graph visualization built with React and Three.js. Renders a GitHub repository's file tree as an animated, GPU-computed physics simulation. Used as the homepage hero header on [cardano.org](https://cardano.org).

Originally created by [Scott Darby](https://github.com/scottdarby) at [IOG](https://github.com/input-output-hk).

## Quick Start

Requires Node 10 (see `.nvmrc`). On newer Node versions, set `NODE_OPTIONS=--openssl-legacy-provider`.

```bash
yarn install
npm run dev:demo          # Dev server at localhost:8080
npm run build:demo        # Production bundle → docs/index.bundle.js
```

## Data Generation

The visualization renders a repository's file tree in which each dot is a file or directory, lines connect files to their parent directories. Files in the same directory share the same color, creating visual clusters.

By default the data in `src/data/nodes.js` and `src/data/edges.js` is used. To visualize a different repo:

```bash
node scripts/generate-data.js <owner/repo> [branch]
```

Examples:

```bash
node scripts/generate-data.js cardano-foundation/cardano-org
node scripts/generate-data.js cardano-foundation/openblockperf main
```

For private repos or higher rate limits, set a GitHub token:

```bash
GITHUB_TOKEN=ghp_xxx node scripts/generate-data.js cardano-foundation/developer-portal
```

The script overwrites `src/data/nodes.js` and `src/data/edges.js` directly. Please restart the dev server to see changes.

## Deployment to cardano-org

```bash
npm run build:demo
cp docs/index.bundle.js /path/to/cardano-org/static/img/headers/medusa.bundle.js
```

The cardano-org `WelcomeHero` component loads the bundle via `<script>` tag into a `#medusa-root` div. Mobile devices get a CSS fallback (no WebGL).

## Customization

| What | Where | Property |
|------|-------|----------|
| Colors | `demo/src/App.js` | `colorPalette` |
| Camera distance | `demo/src/App.js` | `camPosZ` |
| Theme (dark/light) | `demo/src/App.js` | `theme` |
| Node count | `src/Config.js` | `FDG.nodeCount` |
| Sphere size | `src/Config.js` | `FDG.sphereRadius` |

## Architecture

- **`src/Medusa.js`** — Main React component. Orchestrates Three.js scene, camera, renderer, post-processing, and the force-directed graph simulation.
- **`src/libs/FDG.js`** — GPGPU Force Directed Graph. Runs physics entirely on the GPU via render-to-texture.
- **`src/Config.js`** — Global configuration with defaults for node count, sphere radius, GPU tier settings, etc.
- **`src/shaders/`** — GLSL shaders for force calculation (`pull.vert`, `push.vert`, `force.frag`), position integration (`position.frag`), and geometry rendering.
- **`demo/src/App.js`** — Entry point for the deployed bundle. Configures props passed to the Medusa component.

GPU hardware is classified into tiers (via `detect-gpu`) that control node count and post-processing quality.

