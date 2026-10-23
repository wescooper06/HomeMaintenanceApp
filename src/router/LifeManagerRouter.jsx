import { useLayoutEffect } from "react";
import { BrowserRouter, useLocation } from "react-router-dom";
import MainApplication from "../components/layout/MainApplication.jsx";
import MainNavigation from "../components/layout/MainNavigation.jsx";
import TripsApplication from "../pages/Trips/TripsApplication.jsx";
import { resolveLifeManagerRoute } from "./lifeManagerRoutes.js";
import "../components/layout/mainApplication.css";

export function LifeManagerRoutes() {
  const location = useLocation();
  const route = resolveLifeManagerRoute(location);
  useLayoutEffect(() => {
    document.documentElement.dataset.vitePage = route === "trips" ? "trips" : "main";
    document.title = "Life Manager";
  }, [route]);
  if (route !== "trips") return <MainApplication route={route} />;
  return (
    <>
      <MainNavigation active="trips" />
      <TripsApplication home={location.hash.replace(/^#\/?/, "") === "trips" || location.pathname === "/trips"} />
    </>
  );
}

export default function LifeManagerRouter() {
  const basename = /^\/trips(?:\/|$)/.test(window.location.pathname) ? "/trips" : "/";
  return (
    <BrowserRouter basename={basename}>
      <LifeManagerRoutes />
    </BrowserRouter>
  );
}
