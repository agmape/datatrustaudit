import AppHeader from "@/components/AppHeader";

const NotFound = () => (
  <div className="dt-page min-h-screen">
    <AppHeader />
    <div className="flex flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="mb-2 text-5xl font-black dt-text-primary">404</h1>
      <p className="mb-6 dt-text-muted">Page not found / Página não encontrada</p>
      <a href="/" className="rounded-lg bg-blue-600 px-4 py-2 font-semibold text-white hover:bg-blue-500">DataTrust Audit</a>
    </div>
  </div>
);

export default NotFound;
