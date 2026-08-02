import { useParams } from "react-router"
import { useEffect, useState } from "react"
import { useAuthStore } from "@/stores/useAuthStore"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { timeFull } from "@/lib/utils"
import { Shield, Clock, User } from "lucide-react"
import * as userApi from "@/api/user"

interface ProfileUser {
  id: string
  globalName: string
  permission: "admin" | "user"
  online: boolean
  createdAt: number
  lastOnlineAt: number
}

export default function ProfilePage() {
  const { id } = useParams<{ id: string }>()
  const user = useAuthStore((s) => s.user)
  const isOwn = id === user?.id || !id
  const [displayUser, setDisplayUser] = useState<ProfileUser | null>(isOwn ? user : null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    if (isOwn || !user) return
    setLoading(true)
    setLoadError(false)
    userApi.getUser(id!).then((res) => {
      if (res.ok && res.user) {
        setDisplayUser({
          id: res.user.id,
          globalName: res.user.globalName,
          permission: res.user.permission,
          online: res.user.online,
          createdAt: res.user.createdAt,
          lastOnlineAt: res.user.lastOnlineAt,
        })
      } else {
        setLoadError(true)
      }
    }).catch(() => setLoadError(true)).finally(() => setLoading(false))
  }, [id, isOwn, user])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-muted border-t-primary" />
      </div>
    )
  }

  if (!displayUser) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground">
          {loadError ? "Failed to load profile" : "Profile not available"}
        </p>
      </div>
    )
  }

  return (
    <div className="flex h-full items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="flex flex-row items-center gap-4">
          <Avatar className="h-16 w-16">
            <AvatarFallback className="text-xl">{displayUser.globalName.slice(0, 2).toUpperCase()}</AvatarFallback>
          </Avatar>
          <div className="flex flex-col gap-1">
            <CardTitle className="text-xl">{displayUser.globalName}</CardTitle>
            <div className="flex items-center gap-2">
              <Badge variant={displayUser.permission === "admin" ? "default" : "secondary"}>
                <Shield className="mr-1 h-3 w-3" />
                {displayUser.permission}
              </Badge>
              {displayUser.online && (
                <Badge variant="outline" className="text-green-500">
                  Online
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <Separator />
        <CardContent className="pt-4 space-y-3">
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">ID:</span>
            <code className="rounded bg-muted px-1.5 py-0.5 text-xs">{displayUser.id}</code>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Joined:</span>
            <span>{timeFull(displayUser.createdAt)}</span>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-muted-foreground">Last online:</span>
            <span>{timeFull(displayUser.lastOnlineAt)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
