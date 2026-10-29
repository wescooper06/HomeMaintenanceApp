import React from "react";
import ReactDOM from "react-dom/client";

import LifeManagerRouter from "../../src/router/LifeManagerRouter.jsx";
import { restoreMealsDeepLink } from "../../src/router/mealsDeepLink.js";
import "./index.css";

restoreMealsDeepLink(window.location, window.history);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <LifeManagerRouter />
  </React.StrictMode>
);
