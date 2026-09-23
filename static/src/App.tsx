import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { PlanProvider } from "@/context/PlanContext";
import { I18nProvider } from "@/context/I18nContext";
import { AuthProvider } from "@/context/AuthContext";
import { SubscriptionProvider } from "@/context/SubscriptionContext";
import { LocaleProvider } from "@/context/LocaleContext";
import { ThemeProvider } from "@/context/ThemeContext";
import UpgradeModal from "@/components/UpgradeModal";
import AdminPlanTesting from "@/components/AdminPlanTesting";

// Pages
import Index from "./pages/Index";
import AuthPage from "./pages/Auth";
import PricingPage from "./pages/Pricing";
import CheckoutPage from "./pages/Checkout";
import PaymentSuccess from "./pages/PaymentSuccess";
import PaymentPending from "./pages/PaymentPending";
import PaymentFailed from "./pages/PaymentFailed";
import SettingsPage from "./pages/Settings";
import NotFound from "./pages/NotFound";
import AuthCallback from "./pages/AuthCallback";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider>
      <I18nProvider>
        <LocaleProvider>
          <AuthProvider>
            <SubscriptionProvider>
              <PlanProvider>
                <TooltipProvider>
                  <Toaster />
                  <Sonner />
                  <BrowserRouter>
                    <UpgradeModal />
                    <AdminPlanTesting />
                    <Routes>
                      {/* Main app */}
                      <Route path="/" element={<Index />} />

                      {/* Auth */}
                      <Route path="/auth" element={<AuthPage />} />
                      <Route path="/auth/callback" element={<AuthCallback />} />

                      {/* Pricing & Checkout */}
                      <Route path="/pricing" element={<PricingPage />} />
                      <Route path="/checkout" element={<CheckoutPage />} />

                      {/* Post-payment callbacks (Kiwify redirects) */}
                      <Route path="/payment/success" element={<PaymentSuccess />} />
                      <Route path="/payment/pending" element={<PaymentPending />} />
                      <Route path="/payment/failure" element={<PaymentFailed />} />

                      {/* Account Settings */}
                      <Route path="/settings" element={<SettingsPage />} />

                      {/* Catch-all */}
                      <Route path="*" element={<NotFound />} />
                    </Routes>
                  </BrowserRouter>
                </TooltipProvider>
              </PlanProvider>
            </SubscriptionProvider>
          </AuthProvider>
        </LocaleProvider>
      </I18nProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
