import { Outlet } from "react-router-dom";

import NavBar from "./NavBar.jsx";

export default function AppLayout() {
  return (
    <>
      <NavBar />
      <main>
        <Outlet />
      </main>
    </>
  );
}
