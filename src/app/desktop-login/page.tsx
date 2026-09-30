import { LoginScreen } from "@/components/auth/login-form";

/**
 * The desktop app's entry route (warptalk-desktop loads `/desktop-login` into its main window).
 *
 * The same sign-in screen as the web's /login, on purpose: it used to be a separate dark design,
 * and the one account read as two products. It stays its own route because the desktop shell
 * treats this path as its landing page, and the proxy lets it through without a session.
 */
export default function DesktopLoginPage() {
  return <LoginScreen />;
}
