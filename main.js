import './style.css';

import firebase from 'firebase/app';
import 'firebase/firestore';

const ROLE = {
  CALLER: "caller",//a caller creates an offer
  RECEIVER: "receiver"//a receiver creates an answer
}

const firebaseConfig = {
  // your config
  apiKey: "AIzaSyASCrAynpEn2tnlmjyU5SQZoq7Wn7sxJYk",
  authDomain: "webrtc-origin.firebaseapp.com",
  projectId: "webrtc-origin",
  storageBucket: "webrtc-origin.appspot.com",
  messagingSenderId: "401870715926",
  appId: "1:401870715926:web:f6a298e23fe838ca3ec937"
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
const newPc = new RTCPeerConnection(servers);
const peers = [];
const map = new Map();
peers.push(pc);
peers.push(newPc);
let localStream = null;
let remoteStream = null;
let remoteStream2 = null;
let myAudio = null;
let remoteAudio = null;
let remoteAudio2 = null;
const connectionIds = new Set();
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
const roomInput = document.getElementById('roomInput');
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

const myAudioIdInput = document.getElementById('myAudioId');
const remoteAudioIdInput = document.getElementById('remoteAudioId');
const remoteAudioIdInput2 = document.getElementById('remoteAudioId2');

//manger answer, patients call
//Setup media sources for another rtc connection: multi-conn

webcamButton.onclick = async () => {
  localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  remoteStream = new MediaStream();
  remoteStream2 = new MediaStream();

  // Push tracks from local stream to peer connection
  localStream.getTracks().forEach((track) => {
    pc.addTrack(track, localStream);
    if (track.kind === 'audio') {
      myAudio = track;
      myAudioIdInput.value = myAudio.id
      myAudioButton.disabled = false;
    }
    map.set(myAudio.id, myAudio);
  });

  // Pull tracks from remote stream, add to video stream
  pc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream.addTrack(track);
      if (track.kind === 'audio') {
        remoteAudio = track;
        remoteAudioButton.disabled = false;
        remoteAudioIdInput.value = remoteAudio.id;
        map.set(remoteAudio.id, remoteAudio)
      }
    });
  };


  localStream.getTracks().forEach((track) => {
    newPc.addTrack(track, localStream);
    // if (track.kind === 'audio') {
    //   myAudio = track;
    //   myAudioButton.disabled = false;
    // }
  });

  //create another rtcpeerconnection object
  newPc.ontrack = (event) => {
    event.streams[0].getTracks().forEach((track) => {
      remoteStream2.addTrack(track);
      if (track.kind === 'audio') {
        remoteAudio2 = track;
        remoteAudioButton2.disabled = false;
        remoteAudioIdInput2.value = remoteAudio2.id;
        map.set(remoteAudio2.id, remoteAudio2);
      }
    });
  };
  remoteVideo2.srcObject = remoteStream2;
  // peers.push(newPc);

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
  map.set(callDoc.id, roomDoc.id);
  console.log('map', map)
  connectionIds.add(callDoc.id);

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
  map.set(callDoc.id, callRoomId);
  console.log('map', map)
  connectionIds.add(callDoc.id);

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
  roomIdInput.value = roomId;
  callIdInput.value = callId;
  connectionIds.add(callId);
  map.set(callId, roomId);

  console.log("map", map)
  console.log("connectionIds", connectionIds);
  console.log("peers", peers);

  const roomDoc = firestore.collection('rooms').doc(roomId);
  const callDoc = roomDoc.collection('calls').doc(callId);
  const answerCandidates = callDoc.collection('answerCandidates');
  const offerCandidates = callDoc.collection('offerCandidates');
  if (remoteStream.getTracks().length === 0) {
    await answerUpdate(peers[0], callDoc, answerCandidates, offerCandidates);
  } else {
    console.log("add new peer, peers", peers);
    await answerUpdate(peers[1], callDoc, answerCandidates, offerCandidates);//newPc
  }

  updateAudioStatusBtn.disabled = false;
};

myAudioButton.onclick = async () => {
  myAudio.enabled = !myAudio.enabled;
  if (myAudio.enabled) {
    myAudioButton.textContent = 'Audio On';
  } else {
    myAudioButton.textContent = 'Audio Off'
  }
  console.log('map', map);
  console.log('connectionIds', connectionIds);
  if (connectionIds.size > 0) {
    connectionIds.forEach(async connectionId => {
      const roomId = map.get(connectionId);
      const roomDoc = firestore.collection('rooms').doc(roomId);
      const callDoc = roomDoc.collection('calls').doc(connectionId);
      console.log("roomid", roomId)
      console.log("callId", connectionId);
      if (role === ROLE.CALLER) {
        const offerAudioEnabled = { offerAudioEnabled: myAudio.enabled };
        await callDoc.update(offerAudioEnabled);
      }

      if (role === ROLE.RECEIVER) {
        const answerAudioEnabled = { answerAudioEnabled: myAudio.enabled };
        await callDoc.update(answerAudioEnabled);
      }
    })
  }
}

remoteAudioButton.onclick = async () => {
  console.log('remote audio', remoteAudio.enabled)
  remoteAudio.enabled = !remoteAudio.enabled;
  console.log('remote audio after', remoteAudio.enabled)
  if (remoteAudio.enabled) {
    remoteAudioButton.textContent = 'Audio On';
  } else {
    remoteAudioButton.textContent = 'Audio Off'
  }
  console.log('map', map);
  console.log('connectionIds', connectionIds);
  if (connectionIds.size > 0) {
    connectionIds.forEach(async connectionId => {
      const roomId = map.get(connectionId);
      const roomDoc = firestore.collection('rooms').doc(roomId);
      const callDoc = roomDoc.collection('calls').doc(connectionId);
      if (role === ROLE.CALLER) {
        const offerAudioEnabled = { answerAudioEnabled: remoteAudio.enabled };
        await callDoc.update(offerAudioEnabled);
      }

      if (role === ROLE.RECEIVER) {
        const answerAudioEnabled = { offerAudioEnabled: remoteAudio.enabled };
        await callDoc.update(answerAudioEnabled);
      }
    });
  }
}

remoteAudioButton2.onclick = async () => {
  console.log('remote audio', remoteAudio2.enabled)
  remoteAudio2.enabled = !remoteAudio2.enabled;
  console.log('remote audio after', remoteAudio2.enabled)
  if (remoteAudio2.enabled) {
    remoteAudioButton2.textContent = 'Audio On';
  } else {
    remoteAudioButton2.textContent = 'Audio Off'
  }
  console.log('map', map);
  console.log('connectionIds', connectionIds);
  if (connectionIds.size > 0) {
    connectionIds.forEach(async connectionId => {
      const roomId = map.get(connectionId);
      const roomDoc = firestore.collection('rooms').doc(roomId);
      const callDoc = roomDoc.collection('calls').doc(connectionId);
      if (role === ROLE.CALLER) {
        const offerAudioEnabled = { answerAudioEnabled: remoteAudio2.enabled };
        await callDoc.update(offerAudioEnabled);
      }

      if (role === ROLE.RECEIVER) {
        const answerAudioEnabled = { offerAudioEnabled: remoteAudio2.enabled };
        await callDoc.update(answerAudioEnabled);
      }
    });
  }
}

updateAudioStatusBtn.onclick = async () => {
  const connectionIdsArr = Array.from(connectionIds);
  console.log('arr', connectionIdsArr);
  console.log('connectionIds', connectionIds);
  connectionIds.forEach(connectionId => {
    const roomId = map.get(connectionId);
    const roomDoc = firestore.collection('rooms').doc(roomId);
    const callDoc = roomDoc.collection('calls').doc(connectionId);
    callDoc.onSnapshot((snapshot) => {
      const data = snapshot.data();
      console.log('callDoc-data', data)
      //Listen for audio changes and update button text context accroding to db
      if (role && role === ROLE.RECEIVER) {
        myAudio.enabled = data.answerAudioEnabled;
        if (myAudio.enabled) {
          myAudioButton.textContent = 'Audio On';
        } else {
          myAudioButton.textContent = 'Audio Off'
        }
        if (connectionId === connectionIdsArr[0]) {
          remoteAudio.enabled = data.offerAudioEnabled;
          if (remoteAudio.enabled) {
            remoteAudioButton.textContent = 'Audio On';
          } else {
            remoteAudioButton.textContent = 'Audio Off'
          }
        }

        if (connectionId === connectionIdsArr[1]) {
          remoteAudio2.enabled = data.offerAudioEnabled;
          if (remoteAudio2.enabled) {
            remoteAudioButton2.textContent = 'Audio On';
          } else {
            remoteAudioButton2.textContent = 'Audio Off'
          }
        }

      }

      //as a caller, only allows to call one person
      if (role && role === ROLE.CALLER) {
        myAudio.enabled = data.offerAudioEnabled;
        if (myAudio.enabled) {
          myAudioButton.textContent = 'Audio On';
        } else {
          myAudioButton.textContent = 'Audio Off'
        }
        // if (connectionId === connectionIdsArr[0]) {
        remoteAudio.enabled = data.answerAudioEnabled;
        if (remoteAudio.enabled) {
          remoteAudioButton.textContent = 'Audio On';
        } else {
          remoteAudioButton.textContent = 'Audio Off'
        }
        // }

        // if (connectionId === connectionIdsArr[1]) {
        // remoteAudio2.enabled = data.offerAudioEnabled;
        // if (remoteAudio2.enabled) {
        //   remoteAudioButton2.textContent = 'Audio On';
        // } else {
        //   remoteAudioButton2.textContent = 'Audio Off'
        // }
        // }
      }
    });


  });
}