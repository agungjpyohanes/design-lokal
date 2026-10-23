import { Route, Switch } from "wouter";
import { useAuth } from "@/_core/hooks/useAuth";
import AppShell from "./components/AppShell";
import DashboardPage from "./pages/Home";
import RequestsPage from "./pages/Requests";
import TicketsPage from "./pages/Tickets";
import TicketDetailPage from "./pages/TicketDetail";
import DesignerPage from "./pages/Designer";
import QCPage from "./pages/QC";
import AccSessionsPage from "./pages/AccSessions";
import SettingsPage from "./pages/Settings";
import MonitoringTrackingPage from "./pages/MonitoringTracking";
import NotFound from "./pages/NotFound";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { Toaster } from "@/components/ui/sonner";

function AppRoutes() {
  const { user } = useAuth();
  return (
    <AppShell>
      <Switch>
        <Route path="/" component={DashboardPage} />
        <Route path="/requests" component={RequestsPage} />
        <Route path="/tickets" component={TicketsPage} />
        <Route path="/tickets/:id" component={TicketDetailPage} />
        <Route path="/designer">{() => (user?.appRole === "designer" || user?.appRole === "superadmin" || user?.isSuperAdmin) ? <DesignerPage /> : <div className="detail-card"><h2>Workspace khusus Designer</h2><p>Halaman ini hanya tersedia untuk akun dengan role Designer atau Superadmin.</p></div>}</Route>
        <Route path="/qc" component={QCPage} />
        <Route path="/acc-sessions" component={AccSessionsPage} />
        <Route path="/monitoringtracking" component={MonitoringTrackingPage} />
        <Route path="/monitoring-tracking" component={MonitoringTrackingPage} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </AppShell>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <Toaster position="top-right" />
        <AppRoutes />
      </ThemeProvider>
    </ErrorBoundary>
  );
}
