import { useState } from "react";
import { Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";

import { newRecipeFilters } from "../../services/recipeService.js";

import styles from "./MealsPage.module.css";
import { RecipeDetail, RecipeEditor, RecipeLibrary } from "./RecipeCore.jsx";
import ShoppingPage from "./ShoppingPage.jsx";

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
  const [filters, setFilters] = useState(newRecipeFilters);
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
        <Route path="/meals/recipes" element={<RecipeLibrary filters={filters} setFilters={setFilters} />} />
        <Route path="/meals/recipes/new" element={<RecipeEditor />} />
        <Route path="/meals/recipes/:id/edit" element={<RecipeEditor edit />} />
        <Route path="/meals/recipes/:id" element={<RecipeDetail />} />
        <Route path="/meals/shopping" element={<ShoppingPage />} />
        <Route path="*" element={
          <FoundationScreen title="Meals page not found">
            This Meals path is not available. Choose Recipes or Shopping above. Recipe Import remains deferred.
          </FoundationScreen>
        } />
      </Routes>
    </main>
  );
}
