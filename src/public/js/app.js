const socket = io();

let myPeerConnection;
let myStream;
let muted = false;
let cameraOff = false;
let roomName;
let myDataChannel;

const call = document.querySelector("#call"); // call div 태그
const myFace = document.querySelector("#myFace"); // video 태그
const muteBtn = document.querySelector("#mute"); // 오디오 on/off 버튼
const cameraBtn = document.querySelector("#camera"); // 카메라 on/off 버튼
const camerasSelect = document.querySelector("#cameras"); // select 태그

muteBtn.addEventListener("click", handleMuteClick); // 오디오 on/off 버튼
cameraBtn.addEventListener("click", handleCameraBtnClick); // 카메라 on/off 버튼
camerasSelect.addEventListener("input", handleCameraChange); // select option 선택 이벤트

call.hidden = true;

// 사용자의 모든 카메라 장치들을 HTML select로 그려주는 함수
async function getCameras() {
  try {
    // 장치의 모든 미디어 장치를 가져 온 후
    const devices = await navigator.mediaDevices.enumerateDevices();

    // 그 중 카메라들만 가져온다.
    const cameras = devices.filter((device) => device.kind === "videoinput");

    // 현재 사용중인 카메라의 이름(label)을 저장
    const currentCamera = myStream.getVideoTracks()[0];

    // 카메라 갯수만큼 option을 만들고 select에 추가한다.
    //  innerText에는 카메라의 장비의 이름을, value에는 카메라의 고유 ID를 넣는다.
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

// Stream을 만드는 함수이다.
// 파라미터 deviceId는 카메라 ID이다.
// 이 함수는 최초에 파라미터 값 deviceId 없이 바로 실행되는 함수이다.
async function getMedia(deviceId) {
  // 미디어 스트림을 요청할 때 사용하는 초기 제약 조건으로
  // 초기에 유저가 카메라를 선택하지 않은 상황에서 사용되고
  const initialConstraints = {
    audio: true,
    //facingMode가 "user"이면 전면카메라, "environment"면 후면카메라이다. (휴대폰인 경우에만)
    video: { facingMode: "user" },
  };

  // 유저가 특정 카메라를 선택한다면 이 객체를 사용한다.
  const cameraConstraints = {
    audio: true,
    video: { deviceId: { exact: deviceId } },
  };

  try {
    // deviceId가 있다면 (유저가 카메라를 선택했다면) cameraConstrains, 없다면 initialConstrains를 객체로 스트림을 얻는다.
    // 참고로 이 로직이 동작되면 브라우저가 사용자에게 카메라와 오디오의 접근허용을 요구한다.
    myStream = await navigator.mediaDevices.getUserMedia(
      deviceId ? cameraConstraints : initialConstraints
    );

    // video태그 srcObject속성에 스트림 객체 넣어준다.(연결해준다.)
    myFace.srcObject = myStream;

    // 사용자 카메라를 HTML에 select으로 그려주기
    // 최초의 한번만 그려주기 위해서 if문 처리
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

  // 카메라를 변경할 때 stream을 통째로 바꿔버리는데, 상대 유저에게 보내는 track은 바꾸지않고있다.
  // 상대방에게 보내는 track을 교체해줘야 상대방이 확인 가능하다.
  // RTCPeerConnection객체의 getSenders() 메서드는 상대방 에게 보내지는 미디어 스트림 track을 컨트롤할 수 있게 해준다.
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

async function initCall() {
  welcome.hidden = true;
  call.hidden = false;
  await getMedia();
  makeConnection();
}

async function handleWelcomeSubmit(event) {
  event.preventDefault();
  const input = welcomeForm.querySelector("input");

  // initCall에서 media를 가져오는 속도나 연결을 만드는 속도보다
  // socket.io의 속도가 훨씬 빨라서 A가 보낸 offer를 B에서 처리하지 못한다.
  // B 브라우저는 서버에서 offer를 주면 socket.on("offer")에서 다음 코드가 실행되는데
  // myPeerConnection.setRemoteDescription(data.offer);
  // myPeerConnection is undefined에러가 발생한다. 따라서
  // initCall를 먼저 실행하고 join_room을 실행야한다.
  await initCall();
  socket.emit("join_room", { roomName: input.value });
  roomName = input.value;
  input.value = "";
}

welcomeForm.addEventListener("submit", handleWelcomeSubmit);

/**
 * (A 브라우저)
 * B가 방 입장하면 A 브라우저에서 동작하는 함수
 * A유저가 이 방을 만들었고 B유저가 들어오면 A유저 브라우저에서만 동작되는 함수로
 * offer()와 setLocalDescription()가 여기서 실행된다.
 * */
socket.on("welcome", async () => {
  // offer를 보내는 곳이 데이터 채널을 만드는 주체로 chat이라는 데이터 채널을 생성
  myDataChannel = myPeerConnection.createDataChannel("chat");

  // 상대방이 myDataChannel.send("hello") 이런식으로 보내면 수신하는 이벤트
  myDataChannel.addEventListener("message", (event) => {
    console.log("msg", event.data);
  });

  // offer를 출력해보면 sdp키의 value로 이상하고 긴 text가 잇는데 간단히 말하면 초대장같은것이다.
  const offer = await myPeerConnection.createOffer();
  myPeerConnection.setLocalDescription(offer);
  socket.emit("offer", { roomName, offer });
  console.log("sent the offer");
});

/**
 * (B 브라우저)
 * 위에서 A 브라우저가 weclome을 함수를 동작시키면서 offer를 emit하고 서버에서 emit함수를 구현하면서
 * socket.to(room).emit("offer")를 emit하고 브라우저에서 구현하고 이 구현된 offer는 B 브라우저에서만 동작함
 */
socket.on("offer", async (data) => {
  // offer를 보낸 쪽에서 이미 데이터 채널을 만들었기 때문에 B는 eventLister만 달아주면된다.
  myPeerConnection.addEventListener("datachannel", (event) => {
    myDataChannel = event.channel;

    // 상대방이 myDataChannel.send("hello") 이런식으로 보내면 수신하는 이벤트
    myDataChannel.addEventListener("message", (event) => {
      console.log("msg", event.data);
    });
  });

  myPeerConnection.setRemoteDescription(data.offer);
  const answer = await myPeerConnection.createAnswer();
  myPeerConnection.setLocalDescription(answer);
  socket.emit("answer", { answer, roomName });
  console.log("sent the answer");
});

/**
 * (A 브라우저)
 * A의 offer를 받은 B는 answer를 생성하고 소켓 서버에 보낸다.
 * 서버는 B의 answer를 다시 A유저에게 보낸다.
 */
socket.on("answer", (data) => {
  console.log("recevied the offer");
  myPeerConnection.setRemoteDescription(data.answer);
});

socket.on("ice", (data) => {
  console.log("received candidate");
  myPeerConnection.addIceCandidate(data.ice);
});

// makeConnection() 함수를 호출하여 myStream에 있는 미디어 트랙들을 myPeerConnection 객체에 추가합니다.
function makeConnection() {
  // RTCPeerConnection은 두 개의 웹 브라우저(peer) 간에 통신을 설정하고 관리하는 중요한 객체입니다.
  // RTCPeerConnection은 비디오, 오디오 및 데이터 스트림을 주고받는 데 사용됩니다.
  // 이렇게 생성된 peerConnection 객체를 통해 Offers, Answers, IceCandidate, Data Channels 등을 설정하고
  // 관리하여 실제 P2P 통신을 구현할 수 있게 됩니다.
  // RTCPeerConnection에 들어가는 객체는 구글이 제공하는 무료 STUN 서버 list 목록이다.
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

  // myStream에 있는 각 미디어 트랙을(video, audio) myPeerConnection 객체에 추가합니다.
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
