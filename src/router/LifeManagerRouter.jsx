import { lazy, Suspense, useLayoutEffect, useState } from "react";
import { createBrowserRouter, RouterProvider, useLocation } from "react-router-dom";

import MainApplication from "../components/layout/MainApplication.jsx";
import MainNavigation from "../components/layout/MainNavigation.jsx";
import navigationStyles from "../components/layout/MainNavigation.module.css";
import OwnerAuthBoundary from "../components/OwnerAuthBoundary.jsx";
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
      <div className={navigationStyles.frame}>
        <MainNavigation active="trips" />
      </div>
      <TripsApplication home={location.hash.replace(/^#\/?/, "") === "trips" || location.pathname === "/trips"} />
    </>
  );
}

let privateRouter;
function getPrivateRouter() {
  // One page-lifetime router, created only after the owner boundary mounts it.
  if (!privateRouter) privateRouter = createBrowserRouter([
    { path: "*", element: <LifeManagerRoutes /> },
  ], { basename: lifeManagerBasename(window.location.pathname) });
  return privateRouter;
}

function PrivateRouter() {
  const [router] = useState(getPrivateRouter);
  return <RouterProvider router={router} />;
}

export default function LifeManagerRouter() {
  return (
    <OwnerAuthBoundary>
      <PrivateRouter />
    </OwnerAuthBoundary>
  );
}
