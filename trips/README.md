# React + Vite

## Shared Trips source

Trips pages, components, and assets now live in `../src/pages/Trips/`.
The Trips Sheets service is `../src/services/tripsService.js`, and its shared
utilities live in `../src/utils/`. The existing `trips/` package still supplies
the app entry point, dependencies, and Vite configuration. Run `npm run dev`
or `npm run build` here as before; its entry imports the relocated source.
Vite resolves React and Trips UI dependencies from this package for those files.

## Shared Activity Planner source

The standalone Activity Planner entry remains in `../src/activity-planner/`.
Its page and components now live in `../src/pages/ActivityPlanner/`, its Sheets
hook and regeneration helper are combined in
`../src/services/activityPlannerService.js`, and its utilities live in
`../src/utils/plannerUtils.js`. Run `npm run dev:activity-planner` or
`npm run build:activity-planner` here as before.

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
