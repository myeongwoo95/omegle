const socket = io();

let muted = false;
let cameraOff = false;

let myPeerConnection;
let myDataChannel;
let myStream;

let roomName;

const spinner = document.querySelector("#spinner"); // spinner img 태그

const call = document.querySelector("#cameras-container"); // call div 태그
const myFace = document.querySelector("#myFace"); // video 태그
const muteBtn = document.querySelector("#mute"); // 오디오 on/off 버튼
const cameraBtn = document.querySelector("#camera"); // 카메라 on/off 버튼
const camerasSelect = document.querySelector("#cameras"); // select 태그

muteBtn.addEventListener("click", handleMuteClick); // 오디오 on/off 버튼
cameraBtn.addEventListener("click", handleCameraBtnClick); // 카메라 on/off 버튼
camerasSelect.addEventListener("input", handleCameraChange); // select option 선택 이벤트

const msgSendBtn = document.querySelector("#msg-send-btn"); // 메세지 input
const msgInput = document.querySelector("#msg-input"); // 메세지 보내기 버튼

call.hidden = true;
spinner.hidden = true;

function getMsg(msg) {
  const formattedMsg = msg.replace(/\n/g, "<br>");
  const divString = `<div class="message text-only">
                       <p class="text">${formattedMsg}</p>
                     </div>`;

  const newDiv = document.createElement("div");
  newDiv.innerHTML = divString;

  const messagesChat = document.querySelector(".messages-chat");
  messagesChat.appendChild(newDiv);

  msgInput.value = "";
  messagesChat.scrollTop = messagesChat.scrollHeight;
}

function sendMsg() {
  const msg = msgInput.value;
  const formattedMsg = msg.replace(/\n/g, "<br>");
  if (msg === "") return;

  const divString = `<div class="message text-only">
                      <div class="response">
                        <p class="text">${formattedMsg}</p>
                      </div>
                    </div>`;

  const newDiv = document.createElement("div");

  newDiv.innerHTML = divString;

  const messagesChat = document.querySelector(".messages-chat");
  messagesChat.appendChild(newDiv);

  msgString = myDataChannel.send(msg);
  msgInput.value = "";
  messagesChat.scrollTop = messagesChat.scrollHeight;
}

msgSendBtn.addEventListener("click", sendMsg);
msgInput.addEventListener("keydown", function (event) {
  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    sendMsg();
  }
});

async function getCameras() {
  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    const cameras = devices.filter((device) => device.kind === "videoinput");
    const currentCamera = myStream.getVideoTracks()[0];

    cameras.forEach((camera) => {
      const option = document.createElement("option");
      option.value = camera.deviceId;

      option.innerText = camera.label;
      if (currentCamera.label === camera.label) {
        option.selected = true;
      }
      camerasSelect.appendChild(option);
    });
  } catch (error) {
    console.log(error);
  }
}

async function getMedia(deviceId) {
  const initialConstraints = {
    audio: true,
    video: { facingMode: "user" },
  };

  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };

  try {
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstraints
    );

    myFace.srcObject = myStream;

    if (!deviceId) {
      await getCameras();
    }
  } catch (error) {
    console.log(error);
  }
}

function handleMuteClick(event) {
  myStream.getAudioTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });

  if (!muted) {
    muteBtn.innerText = "Unmute";
    muted = true;
  } else {
    muteBtn.innerText = "Mute";
    muted = false;
  }
}

function handleCameraBtnClick() {
  myStream.getVideoTracks().forEach((track) => {
    track.enabled = !track.enabled;
  });
  if (cameraOff) {
    cameraBtn.innerText = "Turn Camera Off";
    cameraOff = false;
  } else {
    cameraBtn.innerText = "Turn Camera On";
    cameraOff = true;
  }
}

async function handleCameraChange() {
  await getMedia(camerasSelect.value);

  if (myPeerConnection) {
    const videoTrack = myStream.getVideoTracks()[0];
    const videoSender = myPeerConnection
      .getSenders()
      .find((sender) => sender.track.kind === "video");
    videoSender.replaceTrack(videoTrack);
  }
}

/** 방 생성(입장) 버튼 */
const welcome = document.querySelector("#welcome");
const welcomeForm = welcome.querySelector("form");
const roomListContainer = document.querySelector("#room-list-container");

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function isRoomFull(roomName) {
  try {
    const response = await fetch(`/api/room/isFull?roomName=${roomName}`);
    const data = await response.json();
    return data.isFull;
  } catch (error) {
    console.error("오류 발생:", error);
  }
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");
  const isFull = await isRoomFull(input.value);

  if (!isFull) {
    spinner.hidden = false;
    // 반드시 initCall를 먼저 실행하고 join_room을 실행야한다.
    await initCall();
    socket.emit("join_room", { roomName: input.value });

    roomName = input.value;
    roomListContainer.hidden = true;
  } else {
    alert("방이 꽉찻습니다.");
  }
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

/** 방 클릭해서 입장하기 */
const roomListContainer_ul = document.querySelector("#room-list-container ul");
roomListContainer_ul.addEventListener("click", async (event) => {
  event.preventDefault();
  const tagName = event.target.tagName;

  if (tagName === "BUTTON") {
    const liElement = event.target.closest("li");
    const spanElement = liElement.querySelector("span");
    const innerTextValue = spanElement.innerText;

    roomListContainer.hidden = true;

    spinner.hidden = false;
    await initCall();
    socket.emit("join_room", { roomName: innerTextValue });
    roomName = innerTextValue;
  }
});

// A 브라우저: B가 방 입장하면 B에게 offer를 보냄
socket.on("welcome", async () => {
  myDataChannel = myPeerConnection.createDataChannel("chat");

  // 데이터 채널 생성자 : 메세지 수신 이벤트 리스너 등록
  myDataChannel.addEventListener("message", (event) => {
    getMsg(event.data);
  });

  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("offer", { roomName, offer });
});

// B 브라우저: A가 보낸 offer를 받고 A에게 answer을 보냄
socket.on("offer", async (data) => {
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;

    // 데이터 채널 구독자 : 메세지 수신 이벤트 리스너 등록
    myDataChannel.addEventListener("message", (event) => {
      getMsg(event.data);
    });
  });

  myPeerConnection.setRemoteDescription(data.offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", { answer, roomName });
  spinner.hidden = true;
});

// A 브라우저: B가 보낸 answer를 받음
socket.on("answer", (data) => {
  myPeerConnection.setRemoteDescription(data.answer);
  spinner.hidden = true;
});

// 브라우저가 떠났을 때 상대방 측에서 실행되는 로직
socket.on("bye", () => {
  peerFace.srcObject = null;
  spinner.hidden = false;
});

socket.on("ice", (data) => {
  myPeerConnection.addIceCandidate(data.ice);
});

socket.on("change_publicRooms", (data) => {
  const ul = document.querySelector("#room-list-container ul");
  ul.innerHTML = "";

  if (data.publicRooms.length === 0) {
    ul.innerHTML = "";
    return;
  }

  data.publicRooms.forEach((publicRoom) => {
    li_string = `<li>
                  <span>${publicRoom}</span>
                  <button class="btn btn-primary">Enter</button>
                </li>`;

    const li = document.createElement("li");
    li.innerHTML = li_string;
    ul.append(li);
  });
});

function makeConnection() {
  myPeerConnection = new RTCPeerConnection({
    iceServers: [
      {
        urls: [
          "stun:stun.l.google.com:19302",
          "stun:stun1.l.google.com:19302",
          "stun:stun2.l.google.com:19302",
          "stun:stun3.l.google.com:19302",
          "stun:stun4.l.google.com:19302",
        ],
      },
    ],
  });

  myPeerConnection.addEventListener("icecandidate", handleIce);
  myPeerConnection.addEventListener("addstream", handleAddStream);

  myStream.getTracks().forEach((track) => {
    myPeerConnection.addTrack(track, myStream);
  });
}

function handleIce(data) {
  socket.emit("ice", { ice: data.candidate, roomName });
}

function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}
