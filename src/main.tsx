import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/inter/standard.css";
import "@fontsource-variable/noto-sans-sc";
import "@fontsource-variable/noto-sans-jp";
import { locale } from "./i18n";
document.documentElement.lang = locale;

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
