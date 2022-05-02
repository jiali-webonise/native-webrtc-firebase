import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const ROLE = {
  CALLER: "caller",//a caller creates an offer
  RECEIVER: "receiver"//a receiver creates an answer
}

const firebaseConfig = {
  // your config
  apiKey: "AIzaSyC8MXXzAuAZJlHZSZpL9gvtgArXzwMp1cg",
  authDomain: "webrtc-demo-84016.firebaseapp.com",
  projectId: "webrtc-demo-84016",
  storageBucket: "webrtc-demo-84016.appspot.com",
  messagingSenderId: "743484605889",
  appId: "1:743484605889:web:6d2239679dd56dddab1b40",
  measurementId: "G-CCDYS8LG1Q"
};

if (!firebase.apps.length) {
  firebase.initializeApp(firebaseConfig);
}
const firestore = firebase.firestore();

const servers = {
  iceServers: [
    {
      urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
    },
  ],
  iceCandidatePoolSize: 10,
};

// Global State
const pc = new RTCPeerConnection(servers);
const peers = [];
peers.push(pc);
let localStream = null;
let remoteStream = null;
let remoteStream2 = null;
let myAudio = null;
let remoteAudio = null;
let remoteAudio2 = null;
let connectionId = null;
let role = null;

// HTML elements
const webcamButton = document.getElementById('webcamButton');
const webcamVideo = document.getElementById('webcamVideo');
const callButton = document.getElementById('callButton');
const callInput = document.getElementById('callInput');
const callRoomButton = document.getElementById('callRoomButton');
const menuSelect = document.getElementById('menu');
menuSelect.disabled = true;

const roomIdInput = document.getElementById('roomId');
const callIdInput = document.getElementById('callId');

const answerButton = document.getElementById('answerButton');
const remoteVideo = document.getElementById('remoteVideo');
const remoteVideo2 = document.getElementById('remoteVideo2');
const hangupButton = document.getElementById('hangupButton');
const updateAudioStatusBtn = document.getElementById('updateAudioButton');

const myAudioButton = document.getElementById('myAudioButton');
const remoteAudioButton = document.getElementById('remoteAudioButton');
const remoteAudioButton2 = document.getElementById('remoteAudioButton2');
myAudioButton.disabled = true;
remoteAudioButton.disabled = true;
remoteAudioButton2.disabled = true;

//manger answer, patients call
//Setup media sources for another rtc connection: multi-conn
const anotherAnswer = async () => {
  const newPc = new RTCPeerConnection(servers);
  console.log("localStream", localStream)
  localStream.getTracks().forEach((track) => {
    newPc.addTrack(track, localStream);
    // if (track.kind === 'audio') {
    //   myAudio = track;
    //   myAudioButton.disabled = false;
    // }
  });
  peers.push(newPc);

  newPc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream2.addTrack(track);
      if (track.kind === 'audio') {
        remoteAudio2 = track;
        remoteAudioButton2.disabled = false;
      }
    });
  };
  remoteVideo2.srcObject = remoteStream2;
}

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();
  remoteStream2 = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
    if (track.kind === 'audio') {
      myAudio = track;
      myAudioButton.disabled = false;
    }
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
      if (track.kind === 'audio') {
        remoteAudio = track;
        remoteAudioButton.disabled = false;
      }
    });
  };

  webcamVideo.srcObject = localStream;
  remoteVideo.srcObject = remoteStream;

  callButton.disabled = false;
  callRoomButton.disabled = false;
  answerButton.disabled = false;
  webcamButton.disabled = true;
  menuSelect.disabled = false;
};

// 2. Create an offer
callButton.onclick = async () => {
  // Reference Firestore collections for signaling

  const roomDoc = firestore.collection('rooms').doc();
  const callDoc = roomDoc.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');
  roomIdInput.value = roomDoc.id;
  callIdInput.value = callDoc.id;
  if (!connectionId) {
    connectionId = callDoc.id;
  }
  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  const offerAudioEnabled = { offerAudioEnabled: myAudio.enabled };
  await callDoc.update(offerAudioEnabled);
  if (!role) {
    role = ROLE.CALLER;
  }
  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
  updateAudioStatusBtn.disabled = false;
  hangupButton.disabled = false;
};

// 2.b Create an offer with roomid
callRoomButton.onclick = async () => {
  // Reference Firestore collections for signaling
  const callRoomId = callRoomInput.value;
  roomIdInput.value = callRoomId;
  const roomDoc = firestore.collection('rooms').doc(callRoomId);
  const callDoc = roomDoc.collection('calls').doc();
  const offerCandidates = callDoc.collection('offerCandidates');
  const answerCandidates = callDoc.collection('answerCandidates');
  callInput.value = callDoc.id;
  callIdInput.value = callDoc.id;

  if (!connectionId) {
    connectionId = callDoc.id;
  }
  // Get candidates for caller, save to db
  pc.onicecandidate = (event) => {
    event.candidate && offerCandidates.add(event.candidate.toJSON());
  };

  // Create offer
  const offerDescription = await pc.createOffer();
  await pc.setLocalDescription(offerDescription);

  const offer = {
    sdp: offerDescription.sdp,
    type: offerDescription.type,
  };

  await callDoc.set({ offer });

  const offerAudioEnabled = { offerAudioEnabled: myAudio.enabled };
  await callDoc.update(offerAudioEnabled);
  if (!role) {
    role = ROLE.CALLER;
  }
  // Listen for remote answer
  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    if (!pc.currentRemoteDescription && data?.answer) {
      const answerDescription = new RTCSessionDescription(data.answer);
      pc.setRemoteDescription(answerDescription);
    }
  });

  // When answered, add candidate to peer connection
  answerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      if (change.type === 'added') {
        const candidate = new RTCIceCandidate(change.doc.data());
        pc.addIceCandidate(candidate);
      }
    });
  });
  updateAudioStatusBtn.disabled = false;
  hangupButton.disabled = false;
};

const answerUpdate = async (pc, callDoc, answerCandidates, offerCandidates) => {
  pc.onicecandidate = (event) => {
    event.candidate && answerCandidates.add(event.candidate.toJSON());
  };

  const callData = (await callDoc.get()).data();

  const offerDescription = callData.offer;
  await pc.setRemoteDescription(new RTCSessionDescription(offerDescription));

  const answerDescription = await pc.createAnswer();
  await pc.setLocalDescription(answerDescription);

  const answer = {
    type: answerDescription.type,
    sdp: answerDescription.sdp,
  };

  await callDoc.update({ answer });

  const answerAudioEnabled = { answerAudioEnabled: myAudio.enabled }
  await callDoc.update(answerAudioEnabled);

  if (!role) {
    role = ROLE.RECEIVER;
  }

  offerCandidates.onSnapshot((snapshot) => {
    snapshot.docChanges().forEach((change) => {
      console.log(change);
      if (change.type === 'added') {
        let data = change.doc.data();
        pc.addIceCandidate(new RTCIceCandidate(data));
      }
    });
  });
}

// 3. Answer the call with the unique ID
answerButton.onclick = async () => {
  const callId = callInput.value;
  const roomId = roomInput.value;
  if (!connectionId) {
    connectionId = callId;
  }
  const roomDoc = firestore.collection('rooms').doc(roomId);
  const callDoc = roomDoc.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');
  if (remoteStream.getTracks().length === 0) {
    await answerUpdate(peers[0], callDoc, answerCandidates, offerCandidates);
  } else {
    await anotherAnswer();
    await answerUpdate(peers[1], callDoc, answerCandidates, offerCandidates);
  }

  updateAudioStatusBtn.disabled = false;
};

myAudioButton.onclick = async () => {
  myAudio.enabled = !myAudio.enabled;
  if (myAudio.enabled) {
    myAudioButton.textContent = 'Unmuted';
  } else {
    myAudioButton.textContent = 'Muted'
  }
  if (connectionId) {
    const callDoc = firestore.collection('calls').doc(connectionId);
    if (role === ROLE.CALLER) {
      const offerAudioEnabled = { offerAudioEnabled: myAudio.enabled };
      await callDoc.update(offerAudioEnabled);
    }

    if (role === ROLE.RECEIVER) {
      const answerAudioEnabled = { answerAudioEnabled: myAudio.enabled };
      await callDoc.update(answerAudioEnabled);
    }
  }
}

remoteAudioButton.onclick = async () => {
  remoteAudio.enabled = !remoteAudio.enabled;
  remoteAudio.enabled ? remoteAudioButton.value = 'Unmuted' : remoteAudioButton.value = 'Muted'
  if (remoteAudio.enabled) {
    remoteAudioButton.textContent = 'Unmuted';
  } else {
    remoteAudioButton.textContent = 'Muted'
  }
  if (connectionId) {
    const callDoc = firestore.collection('calls').doc(connectionId);
    if (role === ROLE.CALLER) {
      const offerAudioEnabled = { answerAudioEnabled: remoteAudio.enabled };
      await callDoc.update(offerAudioEnabled);
    }

    if (role === ROLE.RECEIVER) {
      const answerAudioEnabled = { offerAudioEnabled: remoteAudio.enabled };
      await callDoc.update(answerAudioEnabled);
    }
  }

}

updateAudioStatusBtn.onclick = async () => {
  const callDoc = firestore.collection('calls').doc(connectionId);

  callDoc.onSnapshot((snapshot) => {
    const data = snapshot.data();
    //Listen for audio changes and update button text context accroding to db
    if (role && role === ROLE.RECEIVER) {
      myAudio.enabled = data.answerAudioEnabled;
      if (myAudio.enabled) {
        myAudioButton.textContent = 'Unmuted';
      } else {
        myAudioButton.textContent = 'Muted'
      }

      remoteAudio.enabled = data.offerAudioEnabled;
      if (remoteAudio.enabled) {
        remoteAudioButton.textContent = 'Unmuted';
      } else {
        remoteAudioButton.textContent = 'Muted'
      }
    }

    if (role && role === ROLE.CALLER) {
      myAudio.enabled = data.offerAudioEnabled;
      if (myAudio.enabled) {
        myAudioButton.textContent = 'Unmuted';
      } else {
        myAudioButton.textContent = 'Muted'
      }

      remoteAudio.enabled = data.answerAudioEnabled;
      if (remoteAudio.enabled) {
        remoteAudioButton.textContent = 'Unmuted';
      } else {
        remoteAudioButton.textContent = 'Muted'
      }
    }
  });
}