import { useNavigate } from "react-router"
import { useState } from "react"
import { LogOut, User, MessageSquare, Info } from "lucide-react"
import { useAuthStore } from "@/stores/useAuthStore"
import { useUIStore } from "@/stores/useUIStore"
import { APP_VERSION } from "@/lib/version"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ThemeToggle } from "./ThemeToggle"
import { Menu } from "lucide-react"

export function Header() {
  const navigate = useNavigate()
  const { user, permission, logout } = useAuthStore()
  const toggleSidebar = useUIStore((s) => s.toggleSidebar)
  const [aboutOpen, setAboutOpen] = useState(false)

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  const initials = user?.globalName?.slice(0, 2)?.toUpperCase() || "??"

  return (
    <header className="flex h-14 items-center gap-4 border-b bg-background px-4">
      <Button variant="ghost" size="icon" className="md:hidden" onClick={toggleSidebar} aria-label="Toggle sidebar">
        <Menu className="h-5 w-5" />
      </Button>

      <div className="flex items-center gap-2">
        <MessageSquare className="h-5 w-5 text-primary" />
        <span className="font-semibold hidden sm:inline">Yingo</span>
      </div>

      <div className="flex-1" />

      {permission === "admin" && (
        <Badge variant="secondary" className="text-xs">
          Admin
        </Badge>
      )}

      <ThemeToggle />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative h-8 w-8 rounded-full">
            <Avatar className="h-8 w-8">
              <AvatarFallback className="text-xs">{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex flex-col space-y-1">
              <p className="text-sm font-medium leading-none">{user?.globalName}</p>
              <p className="text-xs leading-none text-muted-foreground">{user?.id}</p>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => navigate(`/profile/${user?.id}`)}>
            <User className="mr-2 h-4 w-4" />
            Profile
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => setAboutOpen(true)}>
            <Info className="mr-2 h-4 w-4" />
            About & Version
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={aboutOpen} onOpenChange={setAboutOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>About Yingo</DialogTitle>
            <DialogDescription>Build information</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 text-sm">
            <div className="flex items-center justify-between gap-4">
              <span className="text-muted-foreground">Version</span>
              <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{APP_VERSION}</code>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </header>
  )
}
