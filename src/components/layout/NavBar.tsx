import { NavLink } from "react-router-dom";

const linkClassName = ({ isActive }: { isActive: boolean }) =>
  isActive
    ? "font-semibold text-white underline underline-offset-4"
    : "text-slate-200 hover:text-white focus-visible:text-white";

/**
 * Vises på alle sider med lenker til Hjem og Watchlist (se design.md).
 */
export function NavBar() {
  return (
    <header className="bg-slate-800">
      <nav
        aria-label="Hovedmeny"
        className="mx-auto flex max-w-5xl items-center justify-between gap-4 p-4"
      >
        <NavLink
          to="/"
          end
          aria-label="Watchlist – gå til forsiden"
          className="text-lg font-bold text-white focus-visible:outline-2 focus-visible:outline-white"
        >
          Watchlist
        </NavLink>
        <ul className="flex gap-4">
          <li>
            <NavLink to="/" end className={linkClassName}>
              Hjem
            </NavLink>
          </li>
          <li>
            <NavLink to="/mylist" className={linkClassName}>
              Watchlist
            </NavLink>
          </li>
        </ul>
      </nav>
    </header>
  );
}
