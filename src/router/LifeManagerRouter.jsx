import { lazy, Suspense, useLayoutEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";

import MainApplication from "../components/layout/MainApplication.jsx";
import MainNavigation from "../components/layout/MainNavigation.jsx";
import TripsApplication from "../pages/Trips/TripsApplication.jsx";

import { lifeManagerBasename, resolveLifeManagerRoute } from "./lifeManagerRoutes.js";
import "../components/layout/mainApplication.css";

const ProjectEditor = lazy(() => import("../pages/Workbench/ProjectEditor.jsx"));

export function LifeManagerRoutes() {
  const location = useLocation();
  const route = resolveLifeManagerRoute(location);
  useLayoutEffect(() => {
    document.documentElement.dataset.vitePage = route === "trips" ? "trips" : "main";
    document.title = "Life Manager";
  }, [route]);
  if (route === "project-create") {
    return (
      <Suspense fallback={<p role="status">Loading project editor...</p>}>
        <MainNavigation active="workbench" />
        <ProjectEditor mode="create" />
      </Suspense>
    );
  }
  if (route !== "trips") return <MainApplication route={route} />;
  return (
    <>
      <MainNavigation active="trips" />
      <TripsApplication home={location.hash.replace(/^#\/?/, "") === "trips" || location.pathname === "/trips"} />
    </>
  );
}

export default function LifeManagerRouter() {
  const basename = lifeManagerBasename(window.location.pathname);
  return (
    <BrowserRouter basename={basename}>
      <LifeManagerRoutes />
    </BrowserRouter>
  );
}
