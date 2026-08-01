import { Outlet } from "react-router"
import { Sidebar } from "./Sidebar"
import { Header } from "./Header"

export function AppShell() {
  return (
    <div className="flex h-screen flex-col">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
