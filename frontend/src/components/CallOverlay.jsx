import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  FiMic,
  FiMicOff,
  FiPhone,
  FiPhoneOff,
  FiVideo,
  FiVideoOff,
} from "react-icons/fi";
import { useAuth } from "../context/AuthContext";
import { useChat } from "../context/ChatContext";
import { translate } from "../utils/translate";
import Avatar from "./Avatar";

function VideoTile({ name, stream, muted = false }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream || null;
  }, [stream]);

  return (
    <div className="call-video-tile">
      <video ref={videoRef} autoPlay playsInline muted={muted} />
      {!stream && <Avatar name={name} size={76} />}
      <span>{name}</span>
    </div>
  );
}

export default function CallOverlay() {
  const { user, settings } = useAuth();
  const t = (text) => translate(settings?.app_language, text);
  const {
    activeCall,
    incomingCall,
    callEvent,
    answerCall,
    declineCall,
    dismissIncomingCall,
    sendCallSignal,
    endCall,
    updateActiveCall,
    setChatError,
  } = useChat();
  const [localStream, setLocalStream] = useState(null);
  const [remoteStreams, setRemoteStreams] = useState({});
  const [microphoneMuted, setMicrophoneMuted] = useState(false);
  const [cameraDisabled, setCameraDisabled] = useState(false);
  const [callError, setCallError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const localStreamRef = useRef(null);
  const activeCallRef = useRef(activeCall);
  const peerConnectionsRef = useRef(new Map());
  const pendingCandidatesRef = useRef(new Map());
  activeCallRef.current = activeCall;

  const addParticipant = useCallback((participant) => {
    updateActiveCall((call) => {
      if (call.participants.some((item) => Number(item.id) === Number(participant.id))) {
        return call;
      }
      return { ...call, participants: [...call.participants, participant] };
    });
  }, [updateActiveCall]);

  const createPeerConnection = useCallback((participantId, shouldOffer) => {
    const call = activeCallRef.current;
    if (!call || !localStreamRef.current) return null;
    const existing = peerConnectionsRef.current.get(participantId);
    if (existing) return existing;

    const peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    peerConnectionsRef.current.set(participantId, peer);
    localStreamRef.current.getTracks().forEach((track) => {
      peer.addTrack(track, localStreamRef.current);
    });
    peer.onicecandidate = (event) => {
      if (!event.candidate) return;
      sendCallSignal({
        type: "call_signal",
        call_id: call.id,
        target_user_id: participantId,
        signal: { candidate: event.candidate.toJSON() },
      });
    };
    peer.ontrack = (event) => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStreams((streams) => ({ ...streams, [participantId]: stream }));
      }
    };
    peer.onconnectionstatechange = () => {
      if (peer.connectionState === "connected") {
        updateActiveCall((current) => ({ ...current, status: "active" }));
        setStatusMessage("");
      }
      if (["failed", "disconnected"].includes(peer.connectionState)) {
        setStatusMessage(t("Reconnecting call..."));
      }
    };

    if (shouldOffer) {
      peer.createOffer()
        .then((offer) => peer.setLocalDescription(offer))
        .then(() => sendCallSignal({
          type: "call_signal",
          call_id: call.id,
          target_user_id: participantId,
          signal: { description: peer.localDescription },
        }))
        .catch((error) => {
          console.error("Could not create call offer:", error);
          setCallError(t("Could not connect the call."));
        });
    }
    return peer;
  }, [sendCallSignal, t, updateActiveCall]);

  useEffect(() => {
    if (!activeCall) {
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      peerConnectionsRef.current.forEach((peer) => peer.close());
      peerConnectionsRef.current.clear();
      pendingCandidatesRef.current.clear();
      setLocalStream(null);
      setRemoteStreams({});
      setMicrophoneMuted(false);
      setCameraDisabled(false);
      setCallError("");
      setStatusMessage("");
      return undefined;
    }

    let cancelled = false;
    setCallError("");
    setStatusMessage(activeCall.status === "calling" ? t("Calling...") : t("Connecting..."));
    const constraints = {
      audio: true,
      video: activeCall.mediaType === "video",
    };
    if (!navigator.mediaDevices?.getUserMedia) {
      const message = t("This browser does not support audio or video calls.");
      setCallError(message);
      setChatError(message);
      endCall();
      return undefined;
    }
    navigator.mediaDevices.getUserMedia(constraints)
      .then((stream) => {
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        localStreamRef.current = stream;
        setLocalStream(stream);
      })
      .catch((error) => {
        if (cancelled) return;
        console.error("Could not access call media devices:", error);
        const message = error?.name === "NotAllowedError"
          ? t("Allow microphone and camera access to make this call.")
          : t("Could not access the microphone or camera.");
        setCallError(message);
        setChatError(message);
        endCall();
      });

    return () => {
      cancelled = true;
      localStreamRef.current?.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      peerConnectionsRef.current.forEach((peer) => peer.close());
      peerConnectionsRef.current.clear();
      pendingCandidatesRef.current.clear();
    };
  }, [activeCall?.id, activeCall?.mediaType, endCall, setChatError, t]);

  useEffect(() => {
    if (!activeCall || !localStream) return;
    activeCall.participants.forEach((participant) => {
      if (Number(participant.id) === Number(user.id)) return;
      createPeerConnection(
        Number(participant.id),
        Number(user.id) < Number(participant.id)
      );
    });
  }, [activeCall, createPeerConnection, localStream, user.id]);

  useEffect(() => {
    if (!callEvent) return;
    const call = activeCallRef.current;
    if (call && callEvent.call_id === call.id) {
      if (callEvent.type === "call_roster") {
        const participants = callEvent.participants
          .filter((participant) => Number(participant.id) !== Number(user.id))
          .concat({ id: user.id, username: user.username });
        updateActiveCall((current) => ({ ...current, participants }));
        setStatusMessage(t("Connecting..."));
      } else if (callEvent.type === "call_participant_joined") {
        if (Number(callEvent.user_id) !== Number(user.id)) {
          addParticipant({ id: callEvent.user_id, username: callEvent.user_name });
          setStatusMessage(t("Connecting..."));
        }
      } else if (callEvent.type === "call_participant_left") {
        peerConnectionsRef.current.get(callEvent.user_id)?.close();
        peerConnectionsRef.current.delete(callEvent.user_id);
        pendingCandidatesRef.current.delete(callEvent.user_id);
        setRemoteStreams((streams) => {
          const next = { ...streams };
          delete next[callEvent.user_id];
          return next;
        });
        updateActiveCall((current) => ({
          ...current,
          participants: current.participants.filter(
            (participant) => Number(participant.id) !== Number(callEvent.user_id)
          ),
        }));
      } else if (callEvent.type === "call_declined") {
        setStatusMessage(t(`${callEvent.user_name} declined the call.`));
      } else if (callEvent.type === "call_ended") {
        updateActiveCall(null);
      } else if (callEvent.type === "call_signal") {
        const peer = createPeerConnection(
          callEvent.from_user_id,
          Number(user.id) < Number(callEvent.from_user_id)
        );
        if (!peer) return;
        const { description, candidate } = callEvent.signal;
        if (description) {
          peer.setRemoteDescription(description)
            .then(async () => {
              const queued = pendingCandidatesRef.current.get(callEvent.from_user_id) || [];
              pendingCandidatesRef.current.delete(callEvent.from_user_id);
              await Promise.all(queued.map((iceCandidate) => peer.addIceCandidate(iceCandidate)));
              if (description.type === "offer") {
                const answer = await peer.createAnswer();
                await peer.setLocalDescription(answer);
                sendCallSignal({
                  type: "call_signal",
                  call_id: call.id,
                  target_user_id: callEvent.from_user_id,
                  signal: { description: peer.localDescription },
                });
              }
            })
            .catch((error) => {
              console.error("Could not process call description:", error);
              setCallError(t("Could not establish the call connection."));
            });
        } else if (candidate) {
          if (peer.remoteDescription) {
            peer.addIceCandidate(candidate).catch((error) => {
              console.error("Could not add call network candidate:", error);
            });
          } else {
            const queued = pendingCandidatesRef.current.get(callEvent.from_user_id) || [];
            pendingCandidatesRef.current.set(callEvent.from_user_id, [...queued, candidate]);
          }
        }
      }
      return;
    }

    if (
      incomingCall
      && callEvent.call_id === incomingCall.call_id
      && callEvent.type === "call_ended"
    ) {
      dismissIncomingCall();
    }
  }, [
    addParticipant,
    callEvent,
    createPeerConnection,
    dismissIncomingCall,
    incomingCall,
    sendCallSignal,
    t,
    updateActiveCall,
    user.id,
    user.username,
  ]);

  const toggleMicrophone = () => {
    const nextMuted = !microphoneMuted;
    localStream?.getAudioTracks().forEach((track) => {
      track.enabled = !nextMuted;
    });
    setMicrophoneMuted(nextMuted);
  };

  const toggleCamera = () => {
    const nextDisabled = !cameraDisabled;
    localStream?.getVideoTracks().forEach((track) => {
      track.enabled = !nextDisabled;
    });
    setCameraDisabled(nextDisabled);
  };

  if (incomingCall && !activeCall) {
    return (
      <div className="message-modal-backdrop call-overlay-backdrop">
        <section className="call-overlay call-incoming" role="dialog" aria-modal="true">
          <Avatar name={incomingCall.caller_name} size={84} />
          <p>{t(incomingCall.media_type === "video" ? "Incoming video call" : "Incoming voice call")}</p>
          <h2>{incomingCall.caller_name}</h2>
          {incomingCall.is_group && <p>{incomingCall.conversation_name}</p>}
          <div className="call-overlay-actions">
            <button type="button" className="call-control call-control--decline" onClick={declineCall}>
              <FiPhoneOff />
              <span>{t("Decline")}</span>
            </button>
            <button
              type="button"
              className="call-control call-control--accept"
              onClick={() => {
                if (!answerCall()) return;
              }}
            >
              {incomingCall.media_type === "video" ? <FiVideo /> : <FiPhone />}
              <span>{t("Accept")}</span>
            </button>
          </div>
        </section>
      </div>
    );
  }

  if (!activeCall) return null;

  const participantName = (participantId) => {
    const participant = activeCall.participants.find(
      (item) => Number(item.id) === Number(participantId)
    );
    return participant?.full_name || participant?.username || t("Participant");
  };

  return (
    <div className="message-modal-backdrop call-overlay-backdrop">
      <section className="call-overlay" role="dialog" aria-modal="true" aria-label={t("Call")}>
        <header className="call-overlay-header">
          <div>
            <h2>{activeCall.conversationName || t("Call")}</h2>
            <p>{callError || statusMessage}</p>
          </div>
          <span className="call-overlay-type">
            {activeCall.mediaType === "video" ? <FiVideo /> : <FiPhone />}
            {t(activeCall.mediaType === "video" ? "Video call" : "Voice call")}
          </span>
        </header>
        <div className={`call-video-grid${activeCall.mediaType === "audio" ? " call-video-grid--audio" : ""}`}>
          {activeCall.mediaType === "video" && localStream && (
            <VideoTile
              name={t("You")}
              stream={localStream}
              muted
            />
          )}
          {activeCall.participants
            .filter((participant) => Number(participant.id) !== Number(user.id))
            .map((participant) => (
              activeCall.mediaType === "video" ? (
                <VideoTile
                  key={participant.id}
                  name={participantName(participant.id)}
                  stream={remoteStreams[participant.id]}
                />
              ) : (
                <div className="call-audio-participant" key={participant.id}>
                  <Avatar name={participantName(participant.id)} size={64} />
                  <span>{participantName(participant.id)}</span>
                  <audio
                    autoPlay
                    ref={(element) => {
                      if (element && remoteStreams[participant.id]) {
                        element.srcObject = remoteStreams[participant.id];
                      }
                    }}
                  />
                </div>
              )
            ))}
          {activeCall.participants.length < 2 && (
            <div className="call-waiting">{t("Waiting for others to join...")}</div>
          )}
        </div>
        {callError && <p className="call-overlay-error" role="alert">{callError}</p>}
        <div className="call-overlay-actions">
          <button
            type="button"
            className={`call-control${microphoneMuted ? " call-control--muted" : ""}`}
            aria-label={t(microphoneMuted ? "Unmute microphone" : "Mute microphone")}
            title={t(microphoneMuted ? "Unmute microphone" : "Mute microphone")}
            onClick={toggleMicrophone}
          >
            {microphoneMuted ? <FiMicOff /> : <FiMic />}
            <span>{t(microphoneMuted ? "Unmute" : "Mute")}</span>
          </button>
          {activeCall.mediaType === "video" && (
            <button
              type="button"
              className={`call-control${cameraDisabled ? " call-control--muted" : ""}`}
              aria-label={t(cameraDisabled ? "Turn camera on" : "Turn camera off")}
              title={t(cameraDisabled ? "Turn camera on" : "Turn camera off")}
              onClick={toggleCamera}
            >
              {cameraDisabled ? <FiVideoOff /> : <FiVideo />}
              <span>{t(cameraDisabled ? "Camera on" : "Camera off")}</span>
            </button>
          )}
          <button type="button" className="call-control call-control--decline" onClick={endCall}>
            <FiPhoneOff />
            <span>{t("End call")}</span>
          </button>
        </div>
      </section>
    </div>
  );
}
