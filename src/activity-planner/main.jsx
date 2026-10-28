import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";

import StandaloneNavigation from "../components/layout/StandaloneNavigation.jsx";
import OwnerAuthBoundary from "../components/OwnerAuthBoundary.jsx";

import App from "./App.jsx";
import "./index.css";

const basename = window.location.pathname.match(/^(.*\/activity-planner)(?:\/|$)/)?.[1] || "/";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <OwnerAuthBoundary>
      <BrowserRouter basename={basename}>
        <StandaloneNavigation />
        <App />
      </BrowserRouter>
    </OwnerAuthBoundary>
  </React.StrictMode>
);