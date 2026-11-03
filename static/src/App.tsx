import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import { I18nProvider } from "@/context/I18nContext";
import { ThemeProvider } from "@/context/ThemeContext";
import { AuthProvider } from "@/context/AuthContext";
import { AdminRoute, ProtectedRoute } from "@/components/RouteGuards";
import Index from "./pages/Index";
import AuthPage from "./pages/Auth";
import AuthCallback from "./pages/AuthCallback";
import AppHome from "./pages/AppHome";
import AuditView from "./pages/AuditView";
import SettingsPage from "./pages/Settings";
import AdminPage from "./pages/Admin";
import NotFound from "./pages/NotFound";

// Legacy URLs keep working: /settings -> /configuracoes, /audit/:id -> /auditorias/:id
const LegacyAudit = () => { const { pathname } = useLocation(); return <Navigate to={pathname.replace('/audit/', '/auditorias/')} replace />; };

// Provider order matters: language and theme first, then the session (which needs only the API client).
const App = () => (
  <ThemeProvider>
    <I18nProvider>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/auth/callback" element={<AuthCallback />} />
              <Route path="/app" element={<ProtectedRoute><AppHome /></ProtectedRoute>} />
              <Route path="/auditorias/:id" element={<ProtectedRoute><AuditView /></ProtectedRoute>} />
              <Route path="/audit/:id" element={<LegacyAudit />} />
              <Route path="/configuracoes" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
              <Route path="/settings" element={<Navigate to="/configuracoes" replace />} />
              <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </I18nProvider>
  </ThemeProvider>
);

export default App;
