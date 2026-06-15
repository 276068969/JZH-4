import { createRouter, createWebHistory } from "vue-router";
import { useAuthStore } from "../stores/auth";

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: "/login", name: "login", component: () => import("../views/LoginView.vue") },
    {
      path: "/",
      component: () => import("../views/ShellView.vue"),
      children: [
        { path: "", redirect: "/dashboard" },
        { path: "dashboard", name: "dashboard", component: () => import("../views/DashboardView.vue") },
        { path: "sea-areas", name: "sea-areas", component: () => import("../views/SeaAreaView.vue") },
        { path: "events", name: "events", component: () => import("../views/EventView.vue") },
        { path: "admin", name: "admin", component: () => import("../views/AdminView.vue") }
      ]
    }
  ]
});

router.beforeEach((to) => {
  const auth = useAuthStore();
  if (to.path !== "/login" && !auth.token) {
    return "/login";
  }
  if (to.path === "/login" && auth.token) {
    return "/dashboard";
  }
  return true;
});

export default router;
