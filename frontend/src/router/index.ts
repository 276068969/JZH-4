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
        { path: "ships", name: "ships", component: () => import("../views/ShipMonitorView.vue") },
        { path: "events", name: "events", component: () => import("../views/EventView.vue") },
        { path: "pollution-alert", name: "pollution-alert", component: () => import("../views/PollutionAlertView.vue") },
        { path: "patrols", name: "patrols", component: () => import("../views/PatrolView.vue") },
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
  if (to.path === "/pollution-alert" && auth.user) {
    if (auth.user.role !== "admin" && auth.user.role !== "supervisor") {
      return "/events";
    }
  }
  return true;
});

export default router;
