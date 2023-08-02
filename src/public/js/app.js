const socket = io();

let myPeerConnection;
let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myDataChannel;

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

function getMsg(msg) {
  // TODO 처음에만 프로필이 나오고 그 이후는 프로파일 사진이 나오지않음
  const time = `<p class="time">15h04</p>`;
  const divString = `<div class="message">
                      <div class="photo" style="background-image: url(https://images.unsplash.com/photo-1438761681033-6461ffad8d80?ixid=MnwxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8&ixlib=rb-1.2.1&auto=format&fit=crop&w=1050&q=80);">
                        <div class="online"></div>
                      </div>
                      <p class="text">${msg}</p>
                    </div>`;

  const newDiv = document.createElement("div");
  newDiv.innerHTML = divString;

  const messagesChat = document.querySelector(".messages-chat");
  messagesChat.appendChild(newDiv);

  msgInput.value = "";
  messagesChat.scrollTop = messagesChat.scrollHeight;
}

function sendMsg() {
  // TODO
  // 1. 일단 시간쪽은 무시하고 개발
  // 2. p(시간) 밑에 div가 붙으면 약간 css 깨짐
  const msg = msgInput.value;
  const time = `<p class="response-time time">15h04</p>`;
  const divString = `<div class="message text-only">
                      <div class="response">
                        <p class="text">${msg}</p>
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
  if (event.key === "Enter") {
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

/** 방 생성 및 입장 */
const welcome = document.querySelector("#welcome");
const welcomeForm = welcome.querySelector("form");

const roomListContainer = document.querySelector("#room-list-container");

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();

  roomListContainer.hidden = true;

  const input = welcomeForm.querySelector("input");

  // initCall를 먼저 실행하고 join_room을 실행야한다.
  await initCall();
  socket.emit("join_room", { roomName: input.value });
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

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
  console.log("sent the answer");
});

// A 브라우저: B가 보낸 answer를 받음
socket.on("answer", (data) => {
  console.log("recevied the offer");
  myPeerConnection.setRemoteDescription(data.answer);
});

socket.on("ice", (data) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(data.ice);
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
  console.log("sent candidate");
  socket.emit("ice", { ice: data.candidate, roomName });
}

function handleAddStream(data) {
  const peerFace = document.getElementById("peerFace");
  peerFace.srcObject = data.stream;
}
