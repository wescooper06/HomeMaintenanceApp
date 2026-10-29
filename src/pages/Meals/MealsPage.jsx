import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import styles from "./MealsPage.module.css";

function FoundationScreen({ title, children }) {
  return (
    <section className={styles.panel} aria-labelledby="meals-screen-title">
      <h2 id="meals-screen-title">{title}</h2>
      <p className={styles.notice}>Phase 0A foundation preview - not data-backed.</p>
      <p>{children}</p>
    </section>
  );
}

export default function MealsPage() {
  const { pathname, search } = useLocation();
  // Retain legacy module selection without leaving Meals on a hash-only URL.
  if (!/^\/meals(?:\/|$)/.test(pathname)) {
    return <Navigate to={{ pathname: "/meals/recipes", search }} replace />;
  }
  return (
    <main className={styles.meals}>
      <header>
        <h1>Meals</h1>
        <p>Recipes and Shopping</p>
      </header>
      <nav className={styles.navigation} aria-label="Meals navigation">
        <NavLink to="/meals/recipes" className={({ isActive }) => isActive ? styles.active : undefined}>
          Recipes
        </NavLink>
        <NavLink to="/meals/shopping" className={({ isActive }) => isActive ? styles.active : undefined}>
          Shopping
        </NavLink>
      </nav>
      <Routes>
        <Route path="/meals" element={<Navigate to={{ pathname: "/meals/recipes", search }} replace />} />
        <Route path="/meals/recipes" element={
          <FoundationScreen title="Recipes">
            Recipe browsing and management will be implemented in Recipe Core. No recipes are loaded or saved here.
          </FoundationScreen>
        } />
        <Route path="/meals/recipes/new" element={
          <FoundationScreen title="Add Recipe">
            Recipe creation is not available in Phase 0A. This reserved route does not save data.
          </FoundationScreen>
        } />
        <Route path="/meals/recipes/:id" element={
          <FoundationScreen title="Recipe Detail">
            Recipe details are not loaded in Phase 0A. This reserved route does not retrieve recipe data.
          </FoundationScreen>
        } />
        <Route path="/meals/shopping" element={
          <FoundationScreen title="Shopping">
            Shopping functionality will be implemented in Phase 2. No shopping items are loaded or saved here.
          </FoundationScreen>
        } />
        <Route path="*" element={
          <FoundationScreen title="Meals page not found">
            This Meals path is not available. Choose Recipes or Shopping above. Recipe Import remains deferred.
          </FoundationScreen>
        } />
      </Routes>
    </main>
  );
}
