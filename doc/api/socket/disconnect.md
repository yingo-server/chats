# Event `disconnect` — Client Disconnected

Emitted by the Socket.IO client when the connection ends (client-initiated
close, network drop, server ping timeout).

## Server Behavior

1. Collects the room list from `socket.rooms` before it is cleared.
2. Removes the socket from the per-user socket set.
3. If this was the user's last socket, deletes the Redis `online:<userId>` key.
4. Broadcasts `v1:online` `{ userId, online: false }` to every room the
   socket had joined.
