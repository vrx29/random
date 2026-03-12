# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Face Detection App

This project has been customized to capture a live webcam stream and display facial
expressions and gender using the [face-api.js](https://github.com/justadudewhohacks/face-api.js)
library. Models are loaded from the `/public/models` directory, so you will need to
copy the following files there before running the app:

- `tiny_face_detector_model-weights_manifest.json` and associated bin files
- `face_expression_model-weights_manifest.json` and associated bin files
- `age_gender_model-weights_manifest.json` and associated bin files

You can download the pretrained weights from the face-api.js repository or any
CDN. An easy way is to clone the repo and copy the `weights` folder:

```bash
cd /Users/vineet/Developer/random/robo-face/public
mkdir -p models
# download/unzip models here or copy from github
```

Once the models are in place you can start the development server with `npm run dev`
and point your browser at `http://localhost:5173`.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
