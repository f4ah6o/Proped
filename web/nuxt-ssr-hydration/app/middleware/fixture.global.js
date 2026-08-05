export default defineNuxtRouteMiddleware((to) => {
  if (to.path !== "/fixture") return;
  const middleware = useState("fixture-middleware", () => ({
    entered: true,
    route: "/fixture",
    externalMutation: false,
  }));
  middleware.value = {
    entered: true,
    route: to.path,
    externalMutation: false,
  };
});
