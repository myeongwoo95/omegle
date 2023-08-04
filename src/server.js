/** Web Server */
import http from "http";
import { Server } from "socket.io";
import { instrument } from "@socket.io/admin-ui";
import express from "express";

const port = 3000;
const app = express();

app.set("view engine", "ejs");
app.set("views", __dirname + "/views");
app.use("/public", express.static(__dirname + "/public"));

app.get("/", (req, res) => {
  const publicRooms = getPublicRooms();
  const numOfPublicRooms = getCountPublicRooms();

  res.render("home", { publicRooms, numOfPublicRooms });
});

app.get("/api/room/isFull", (req, res) => {
  const roomName = req.query.roomName;
  const room = io.sockets.adapter.rooms.get(roomName);

  // 방이 이미 존재하고, 유저가 2명 이상
  if (room && room.size >= 2) {
    res.json({ isFull: true });
  } else {
    res.json({ isFull: false });
  }
});

function getCountPublicRooms() {
  return getPublicRooms().length;
}

function getPublicRooms() {
  const publicRooms = [];

  const sids = io.sockets.adapter.sids;
  const rooms = io.sockets.adapter.rooms;

  rooms.forEach((_, key) => {
    const participants = Array.from(rooms.get(key) || new Set());

    // private room이 아니면서 방에 유저가 1명만 존재할 때
    if (sids.get(key) === undefined && participants.length === 1)
      publicRooms.push(key);
  });

  return publicRooms;
}

/** Socket Server */
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: ["https://admin/socket.io"],
    credentials: true,
  },
});

instrument(io, {
  auth: false,
});

io.on("connection", (socket) => {
  socket.onAny((event) => {
    console.log(`Socket Event: ${event}`);
  });

  socket.on("disconnecting", () => {
    // 소켓이 현재 참가하고 있는 모든 방에 대해 반복문
    socket.rooms.forEach((room) => {
      socket.to(room).emit("bye", {});
    });
  });

  socket.on("disconnect", () => {
    // 대기실에 있는 사람들 실시간을 방 목록 변경
    io.sockets.emit("change_publicRooms", {
      publicRooms: getPublicRooms(),
    });
  });

  socket.on("join_room", (data) => {
    const room = io.sockets.adapter.rooms.get(data.roomName);

    // 방이 이미 존재하고, 유저가 2명 이상이 아닌 경우(부정문)
    if (!(room && room.size >= 2)) {
      socket.join(data.roomName);
      socket.to(data.roomName).emit("welcome");

      // 대기실에 있는 사람들 실시간을 방 목록 변경
      io.sockets.emit("change_publicRooms", {
        publicRooms: getPublicRooms(),
      });
    }
  });

  socket.on("offer", (data) => {
    socket.to(data.roomName).emit("offer", {
      offer: data.offer,
    });
  });

  socket.on("answer", (data) => {
    socket.to(data.roomName).emit("answer", {
      answer: data.answer,
    });
  });

  socket.on("ice", (data) => {
    socket.to(data.roomName).emit("ice", {
      ice: data.ice,
    });
  });
});

httpServer.listen(port, () => {
  console.log(`listening ${port}`);
});
