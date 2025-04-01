"use client";
import { useEffect, useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import type { Socket } from "socket.io-client";
import { FaMoon, FaSun } from 'react-icons/fa';

type Message = {
  senderId: string;
  message: string;
  timestamp: Date;
  isRead?: boolean;
  isDelivered?: boolean;
  isPhoto?: boolean;
  photoData?: ArrayBuffer;
  messageType?: string;
};

type User = {
  id: string;
  name: string;
  lastName: string;
  email?: string;
};

type RTCData = {
  senderId: string;
  receiverId: string;
  offer?: RTCSessionDescriptionInit;
  answer?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
};

// Define types for socket.io messages
interface ChatHistoryMessage {
  id?: string;
  sender_id: string;
  receiver_id?: string;
  content?: string;
  message?: string;
  created_at?: string;
  createdAt?: string;
  timestamp?: string;
  is_read?: boolean;
  is_delivered?: boolean;
  message_type?: string;
  photo_data?: ArrayBuffer;
}

interface ReceiveMessageData {
  senderId: string;
  message: string;
  timestamp?: string;
  messageType?: string;
}

interface ReceivePhotoData {
  senderId: string;
  photo: ArrayBuffer;
  message?: string; // Fotoğrafla birlikte gelen mesaj
  messageType: string;
}

interface UnreadMessageCount {
  sender_id: string;
  _count: {
    id: number;
  }
}

// Define custom socket type with the events we use
interface CustomSocket extends Socket {
  emit(event: "online_user_list"): this;
  emit(event: "full_user_list"): this;
  emit(event: "send_message", data: { receiver_id: string; message: string; messageType?: string }): this;
  emit(event: "send_photo", data: { receiver_id: string; photo: ArrayBuffer; message?: string }): this;
  emit(event: "get_chat_history", data: { user_id: string }): this;
  emit(event: "unread_message"): this;
  emit(event: "read_messages", data: { sender_id: string }): this;
  emit(event: "offer", data: RTCData): this;
  emit(event: "answer", data: RTCData): this;
  emit(event: "candidate", data: RTCData): this;
  emit(event: "join_call", data: { senderId: string; receiverId: string }): this;

  on(event: "connect", listener: () => void): this;
  on(event: "disconnect", listener: () => void): this;
  on(event: "error", listener: (error: Error) => void): this;
  on(event: "online_users", listener: (data: User[]) => void): this;
  on(event: "full_user_list", listener: (data: User[]) => void): this;
  on(event: "chat_history", listener: (data: ChatHistoryMessage[]) => void): this;
  on(event: "receive_message", listener: (data: ReceiveMessageData) => void): this;
  on(event: "receive_photo", listener: (data: ReceivePhotoData) => void): this;
  on(event: "unread_messages", listener: (data: UnreadMessageCount[]) => void): this;
  on(event: "message_read", listener: (data: { by: string }) => void): this;
  on(event: "offer", listener: (data: RTCData) => void): this;
  on(event: "answer", listener: (data: RTCData) => void): this;
  on(event: "candidate", listener: (data: RTCData) => void): this;
  on(event: "join_call", listener: (data: { senderId: string; receiverId: string }) => void): this;
}

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [socket, setSocket] = useState<CustomSocket | null>(null);
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [userListRequested, setUserListRequested] = useState<boolean>(false);
  const [unreadMessages, setUnreadMessages] = useState<Record<string, number>>({});
  const [selectedImage, setSelectedImage] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const notificationRef = useRef<HTMLAudioElement>(null);
  const router = useRouter();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const selectedUserRef = useRef<string | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(false);
  const [compressProgress, setCompressProgress] = useState<number>(0);
  const [isCompressing, setIsCompressing] = useState<boolean>(false);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const MAX_IMAGE_SIZE_MB = 1;
  const MAX_IMAGE_SIZE_BYTES = MAX_IMAGE_SIZE_MB * 1024 * 1024;

  useEffect(() => {
    selectedUserRef.current = selectedUser;

    if (selectedUser && socket) {
      socket.emit("read_messages", { sender_id: selectedUser });
    }
  }, [selectedUser, socket]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const token = localStorage.getItem("token");
    if (!token) {
      router.push("/");
      return;
    }

    try {
      const tokenPayload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserId(tokenPayload.sub);
    } catch (error) {
      console.error("Error parsing token:", error);
    }

    import('socket.io-client').then(({ io }) => {
      const socketIo = io("https://api.batuhantekin.info", {
        query: { token },
        transports: ['websocket'],
      }) as CustomSocket;

      socketIo.on("connect", () => {
        console.log("WebSocket connection established");

        if (!userListRequested) {
          console.log("Requesting user lists...");
          setTimeout(() => {
            socketIo.emit("full_user_list");
            socketIo.emit("online_user_list");
            socketIo.emit("unread_message");
            setUserListRequested(true);
          }, 500);
        }
      });

      socketIo.on("full_user_list", (userListData: User[]) => {
        console.log("Received full user list:", userListData);
        if (Array.isArray(userListData)) {
          setAllUsers(userListData.filter(user => user && user.id !== currentUserId));
        }
      });

      socketIo.on("online_users", (userListData: User[]) => {
        console.log("Received online users:", userListData);
        if (Array.isArray(userListData)) {
          setOnlineUsers(userListData.filter(user => user && user.id !== currentUserId));
        }
      });

      socketIo.on("unread_messages", (unreadData: UnreadMessageCount[]) => {
        console.log("Unread messages received:", unreadData);
        const unreadCounts: Record<string, number> = {};

        unreadData.forEach(item => {
          unreadCounts[item.sender_id] = item._count.id;
        });

        setUnreadMessages(unreadCounts);
      });

      socketIo.on("message_read", (data: { by: string }) => {
        console.log(`Messages read by user ${data.by}`);

        if (data.by === selectedUserRef.current) {
          setMessages(prevMessages =>
            prevMessages.map(msg =>
              msg.senderId === currentUserId ? { ...msg, isRead: true } : msg
            )
          );
        }
      });

      socketIo.on("chat_history", (historyData: ChatHistoryMessage[]) => {
        console.log("Chat history received:", historyData);

        if (Array.isArray(historyData) && historyData.length > 0) {
          const formattedMessages = historyData.map(msg => ({
            senderId: msg.sender_id,
            message: msg.content || msg.message || "",
            timestamp: new Date(msg.createdAt ?? msg.created_at ?? msg.timestamp ?? Date.now()),
            isRead: msg.is_read || false,
            isDelivered: msg.is_delivered || false,
            isPhoto: msg.message_type === 'photo',
            photoData: msg.photo_data,
            messageType: msg.message_type
          }));

          formattedMessages.sort((a, b) =>
            a.timestamp.getTime() - b.timestamp.getTime()
          );

          setMessages(formattedMessages);
        } else {
          setMessages([]);
        }
      });

      socketIo.on("receive_message", (data: ReceiveMessageData) => {
        console.log("Message received:", data);
        console.log("Currently selected user:", selectedUserRef.current);

        if (data.senderId !== selectedUserRef.current) {
          if (notificationRef.current) {
            notificationRef.current.play().catch(err => console.error("Bildirim sesi çalınamadı:", err));
          }

          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            const user = allUsers.find(u => u.id === data.senderId);
            const userName = user ? `${user.name} ${user.lastName}` : "Yeni mesaj";

            new Notification("Yeni Mesaj", {
              body: `${userName}: ${data.message}`,
              icon: "/notification-icon.png"
            });
          } else {
            console.warn("Bildirim gönderilemedi. Tarayıcı bildirimleri desteklemiyor veya izin verilmedi.");
          }

          socketIo.emit("unread_message");
        } else {
          setMessages(prevMessages => [...prevMessages, {
            senderId: data.senderId,
            message: data.message,
            timestamp: new Date(),
            isDelivered: true,
            isRead: false,
            messageType: data.messageType || 'text'
          }]);

          socketIo.emit("read_messages", { sender_id: data.senderId });
        }
      });

      socketIo.on("receive_photo", (data: ReceivePhotoData) => {
        console.log("Fotoğraf alındı:", data);

        if (data.senderId !== selectedUserRef.current) {
          if (notificationRef.current) {
            notificationRef.current.play().catch(err => console.error("Bildirim sesi çalınamadı:", err));

            if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
              const user = allUsers.find(u => u.id === data.senderId);
              const userName = user ? `${user.name} ${user.lastName}` : "Yeni mesaj";

              new Notification("Yeni Fotoğraf", {
                body: data.message
                  ? `${userName}: ${data.message}`
                  : `${userName} bir fotoğraf gönderdi`,
                icon: "/notification-icon.png"
              });
            } else {
              console.warn("Bildirim gönderilemedi. Tarayıcı bildirimleri desteklemiyor veya izin verilmedi.");
            }
          }

          socketIo.emit("unread_message");
        } else {
          setMessages(prevMessages => [...prevMessages, {
            senderId: data.senderId,
            message: data.message || "Fotoğraf gönderdi",
            timestamp: new Date(),
            isDelivered: true,
            isRead: false,
            isPhoto: true,
            photoData: data.photo,
            messageType: 'photo'
          }]);

          socketIo.emit("read_messages", { sender_id: data.senderId });
        }
      });

      socketIo.on("disconnect", () => {
        console.log("WebSocket disconnected");
      });

      socketIo.on("error", (error: Error) => {
        console.error("WebSocket error:", error);
      });

      setSocket(socketIo);

      return () => {
        socketIo.disconnect();
      };
    });
  }, [router, currentUserId, userListRequested, allUsers]);

  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission().catch((error) => {
          console.error("Bildirim izni alınırken hata oluştu:", error);
        });
      }
    } else {
      console.warn("Tarayıcı bildirimleri desteklemiyor.");
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedTheme = localStorage.getItem('darkMode');

      if (savedTheme !== null) {
        setDarkMode(savedTheme === 'true');
      } else {
        const prefersDarkMode = window.matchMedia('(prefers-color-scheme: dark)').matches;
        setDarkMode(prefersDarkMode);
      }
    }
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('darkMode', darkMode.toString());

      if (darkMode) {
        document.documentElement.classList.add('dark-theme');
      } else {
        document.documentElement.classList.remove('dark-theme');
      }
    }
  }, [darkMode]);

  const toggleDarkMode = () => {
    setDarkMode(prevMode => !prevMode);
  };

  const refreshUserLists = () => {
    if (socket) {
      console.log("Manually refreshing user lists...");
      socket.emit("full_user_list");
      socket.emit("online_user_list");
      socket.emit("unread_message");
    }
  };

  const compressAndEncodeImage = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      setIsCompressing(true);
      setCompressProgress(0);

      if (file.size <= MAX_IMAGE_SIZE_BYTES) {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
          setIsCompressing(false);
          setCompressProgress(100);
          resolve(reader.result as string);
        };
        reader.onerror = (error) => {
          setIsCompressing(false);
          reject(error);
        };
        return;
      }

      const img = document.createElement('img');
      const reader = new FileReader();

      reader.onload = (e) => {
        img.src = e.target!.result as string;

        img.onload = () => {
          setCompressProgress(30);

          let width = img.width;
          let height = img.height;
          const maxDimension = 1600;

          if (width > height && width > maxDimension) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else if (height > maxDimension) {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }

          setCompressProgress(50);

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx!.drawImage(img, 0, 0, width, height);

          setCompressProgress(70);

          let quality = 0.7;
          let base64 = canvas.toDataURL('image/jpeg', quality);

          while (base64.length > MAX_IMAGE_SIZE_BYTES * 1.37 && quality > 0.1) {
            quality -= 0.1;
            base64 = canvas.toDataURL('image/jpeg', quality);
          }

          setCompressProgress(100);
          setIsCompressing(false);
          resolve(base64);
        };
      };

      reader.onerror = (error) => {
        setIsCompressing(false);
        reject(error);
      };

      reader.readAsDataURL(file);
    });
  };

  const base64ToArrayBuffer = (base64: string): ArrayBuffer => {
    const base64Data = base64.split(',')[1];
    const binaryString = atob(base64Data);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];

      const fileSizeMB = file.size / (1024 * 1024);
      console.log(`Seçilen dosya boyutu: ${fileSizeMB.toFixed(2)} MB`);

      setSelectedImage(file);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleSend = async () => {
    if (!socket || !selectedUser) {
      alert("Lütfen bir kullanıcı seçiniz.");
      return;
    }

    if (selectedImage) {
      try {
        setIsCompressing(true);

        const base64Data = await compressAndEncodeImage(selectedImage);

        const arrayBuffer = base64ToArrayBuffer(base64Data);

        const hasMessage = input.trim().length > 0;

        socket.emit("send_photo", {
          receiver_id: selectedUser,
          photo: arrayBuffer,
          message: hasMessage ? input : undefined
        });

        setMessages(prevMessages => [...prevMessages, {
          senderId: currentUserId,
          message: hasMessage ? input : "Fotoğraf gönderildi",
          timestamp: new Date(),
          isDelivered: isUserOnline(selectedUser),
          isRead: false,
          isPhoto: true,
          photoData: arrayBuffer,
          messageType: 'photo'
        }]);

        clearSelectedImage();
        setInput("");
      } catch (error) {
        console.error("Fotoğraf sıkıştırma/gönderme hatası:", error);
        alert("Fotoğraf gönderilirken bir hata oluştu.");
        setIsCompressing(false);
      }
    } else if (input.trim()) {
      const messageData = {
        receiver_id: selectedUser,
        message: input,
        messageType: 'text'
      };

      socket.emit("send_message", messageData);

      setMessages(prevMessages => [...prevMessages, {
        senderId: currentUserId,
        message: input,
        timestamp: new Date(),
        isDelivered: isUserOnline(selectedUser),
        isRead: false,
        messageType: 'text'
      }]);

      setInput("");
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    setMessages([]);

    if (socket) {
      console.log(`Requesting chat history with ${userId}...`);
      socket.emit("get_chat_history", { user_id: userId });

      socket.emit("read_messages", { sender_id: userId });
    }
  };

  const isUserOnline = (userId: string): boolean => {
    return onlineUsers.some(user => user.id === userId);
  };

  const getUserFullName = (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? `${user.name} ${user.lastName}` : userId;
  };

  const renderMessageStatus = (message: Message) => {
    if (message.senderId !== currentUserId) return null;

    if (message.isRead) {
      return (
        <span className="text-xs text-green-500 ml-1" title="Okundu">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
            <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
          </svg>
        </span>
      );
    }

    if (message.isDelivered) {
      return (
        <span className="text-xs text-gray-400 ml-1" title="İletildi">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
            <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
          </svg>
        </span>
      );
    }

    return (
      <span className="text-xs text-gray-300 ml-1" title="Gönderildi">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
      </span>
    );
  };

  const arrayBufferToDataUrl = (buffer: ArrayBuffer, type = 'image/jpeg') => {
    const blob = new Blob([buffer], { type });
    return URL.createObjectURL(blob);
  };

  const createPeerConnection = useCallback(() => {
    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });

    peerConnection.onicecandidate = (event) => {
      if (event.candidate && socket && selectedUser) {
        socket.emit("candidate", {
          senderId: currentUserId,
          receiverId: selectedUser,
          candidate: event.candidate,
        });
      }
    };

    peerConnection.ontrack = (event) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
        setRemoteStream(event.streams[0]);
      }
    };

    peerConnectionRef.current = peerConnection;
    return peerConnection;
  }, [socket, selectedUser, currentUserId]);

  const startLocalStream = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      return stream;
    } catch (error) {
      console.error("Kamera veya mikrofon erişim hatası:", error);
      throw error;
    }
  }, []);

  const handleOffer = useCallback(async (data: RTCData) => {
    if (data.receiverId !== currentUserId) return;

    try {
      setSelectedUser(data.senderId);

      const peerConnection = createPeerConnection();
      const stream = await startLocalStream();
      setLocalStream(stream);

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer!));

      const answer = await peerConnection.createAnswer();
      await peerConnection.setLocalDescription(answer);

      socket?.emit("answer", {
        senderId: currentUserId,
        receiverId: data.senderId,
        answer,
      });
    } catch (err) {
      console.error("Offer işlenirken hata:", err);
    }
  }, [currentUserId, createPeerConnection, socket, startLocalStream]);

  const handleAnswer = useCallback(async (data: RTCData) => {
    if (data.receiverId !== currentUserId) return;

    try {
      await peerConnectionRef.current?.setRemoteDescription(
        new RTCSessionDescription(data.answer!)
      );
    } catch (err) {
      console.error("Answer işlenirken hata:", err);
    }
  }, [currentUserId]);

  const handleCandidate = useCallback(async (data: RTCData) => {
    if (data.receiverId !== currentUserId) return;

    try {
      await peerConnectionRef.current?.addIceCandidate(
        new RTCIceCandidate(data.candidate!)
      );
    } catch (err) {
      console.error("ICE Candidate işlenirken hata:", err);
    }
  }, [currentUserId]);

  const initiateCall = useCallback(async () => {
    if (!socket || !selectedUser) {
      alert("Lütfen bir kullanıcı seçiniz.");
      return;
    }

    try {
      const peerConnection = createPeerConnection();
      const stream = await startLocalStream();
      setLocalStream(stream);

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      socket.emit("offer", {
        senderId: currentUserId,
        receiverId: selectedUser,
        offer,
      });
    } catch (err) {
      console.error("Arama başlatılırken hata:", err);
    }
  }, [socket, selectedUser, currentUserId, createPeerConnection, startLocalStream]);

  const joinCall = useCallback(async () => {
    if (!socket || !selectedUser) {
      alert("Lütfen bir kullanıcı seçiniz.");
      return;
    }

    try {
      const peerConnection = createPeerConnection();
      const stream = await startLocalStream();
      setLocalStream(stream);

      stream.getTracks().forEach((track) => {
        peerConnection.addTrack(track, stream);
      });

      socket.emit("join_call", {
        senderId: currentUserId,
        receiverId: selectedUser,
      });
    } catch (err) {
      console.error("Aramaya katılırken hata:", err);
    }
  }, [socket, selectedUser, currentUserId, createPeerConnection, startLocalStream]);

  const endCall = useCallback(() => {
    localStream?.getTracks().forEach((track) => track.stop());
    remoteStream?.getTracks().forEach((track) => track.stop());
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
  }, [localStream, remoteStream]);

  useEffect(() => {
    if (!socket) return;

    socket.on("join_call", async (data: { senderId: string; receiverId: string }) => {
      if (data.receiverId !== currentUserId) return;

      try {
        const peerConnection = createPeerConnection();
        const stream = await startLocalStream();
        setLocalStream(stream);

        stream.getTracks().forEach((track) => {
          peerConnection.addTrack(track, stream);
        });
      } catch (err) {
        console.error("join_call işlenirken hata:", err);
      }
    });

    return () => {
      socket.off("join_call");
    };
  }, [socket, currentUserId, createPeerConnection, startLocalStream]);

  useEffect(() => {
    if (!socket) return;

    socket.on("offer", handleOffer);
    socket.on("answer", handleAnswer);
    socket.on("candidate", handleCandidate);

    return () => {
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("candidate", handleCandidate);
    };
  }, [socket, handleOffer, handleAnswer, handleCandidate]);

  return (
    <div className={`flex flex-col items-center justify-center min-h-screen p-4 transition-colors duration-300 ${darkMode ? 'bg-gray-900 text-white' : 'bg-gray-50 text-gray-800'}`}>
      <audio ref={notificationRef} src="/message-notification.mp3" />

      <div className={`w-full max-w-6xl shadow-lg rounded-lg p-4 flex flex-col md:flex-row gap-4 transition-colors duration-300 ${darkMode ? 'bg-gray-800 text-white' : 'bg-white text-gray-800'}`}>
        <button
          onClick={toggleDarkMode}
          className={`absolute top-4 right-4 p-2 rounded-full ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
          aria-label={darkMode ? "Aydınlık moda geç" : "Karanlık moda geç"}
          title={darkMode ? "Aydınlık moda geç" : "Karanlık moda geç"}
        >
          {darkMode ? <FaSun className="text-yellow-400" /> : <FaMoon className="text-blue-900" />}
        </button>

        <div className={`w-full md:w-1/4 border rounded-lg p-4 transition-colors duration-300 ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-100 border-gray-300'}`}>
          <h3 className={`text-xl font-semibold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>Kullanıcılar</h3>

          {allUsers.length === 0 ? (
            <div className={`text-center p-4 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>Kullanıcı bulunamadı</div>
          ) : (
            <ul className="space-y-2">
              {allUsers.map((user) => {
                const isOnline = isUserOnline(user.id);
                const unreadCount = unreadMessages[user.id] || 0;

                return (
                  <li
                    key={user.id}
                    className={`p-2 rounded-md cursor-pointer ${
                      selectedUser === user.id
                        ? (darkMode
                            ? 'bg-blue-900 border-l-4 border-blue-500'
                            : 'bg-blue-100 border-l-4 border-blue-500')
                        : (darkMode
                            ? 'hover:bg-gray-600'
                            : 'hover:bg-gray-200')
                    } flex items-center justify-between transition-colors duration-300`}
                    onClick={() => handleUserSelect(user.id)}
                  >
                    <div className="flex items-center">
                      {isOnline ? (
                        <div className="relative mr-2">
                          <div className="w-3 h-3 rounded-full bg-green-500" title="Online"></div>
                          {unreadCount > 0 && (
                            <div className="absolute -top-2 -right-2 flex items-center justify-center min-w-[16px] h-[16px] text-[10px] font-bold bg-green-600 text-white rounded-full px-1">
                              {unreadCount > 99 ? '99+' : unreadCount}
                            </div>
                          )}
                        </div>
                      ) : (
                        unreadCount > 0 && (
                          <div className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold mr-2">
                            {unreadCount > 9 ? '9+' : unreadCount}
                          </div>
                        )
                      )}
                      <span>{user.name} {user.lastName}</span>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
          <button
            className={`w-full mt-4 py-2 text-white rounded-lg ${darkMode ? 'bg-green-700 hover:bg-green-800' : 'bg-green-500 hover:bg-green-600'}`}
            onClick={refreshUserLists}
          >
            Kullanıcı Listesini Yenile
          </button>
        </div>

        <div className="w-full md:w-3/4 flex flex-col">
          <h2 className={`text-2xl font-bold mb-4 ${darkMode ? 'text-white' : 'text-gray-800'}`}>
            Sohbet {selectedUser ? `- ${getUserFullName(selectedUser)}` : ""}
            {selectedUser && isUserOnline(selectedUser) && (
              <span className="inline-block relative ml-2">
                <span className="inline-block w-3 h-3 rounded-full bg-green-500" title="Online"></span>
                {(unreadMessages[selectedUser] || 0) > 0 && (
                  <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[16px] h-[16px] text-[10px] font-bold bg-green-600 text-white rounded-full px-1">
                    {unreadMessages[selectedUser] > 99 ? '99+' : unreadMessages[selectedUser]}
                  </span>
                )}
              </span>
            )}
          </h2>

          <div className={`flex flex-col gap-4 mb-4 overflow-y-auto h-96 border rounded-lg p-4 transition-colors duration-300 ${
            darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'
          }`}>
            {messages.length === 0 ? (
              <div className={`text-center p-4 ${darkMode ? 'text-gray-300' : 'text-gray-500'}`}>
                {selectedUser ? "Bu kullanıcı ile sohbet başlatın" : "Sohbet etmek için bir kullanıcı seçin"}
              </div>
            ) : (
              messages.map((message, index) => (
                <div
                  key={index}
                  className={`p-3 rounded-lg max-w-[80%] ${
                    message.senderId === currentUserId
                      ? (darkMode ? "bg-blue-800 text-white self-end" : "bg-blue-500 text-white self-end")
                      : (darkMode ? "bg-gray-600 text-white self-start" : "bg-gray-200 text-gray-800 self-start")
                  }`}
                >
                  {(message.isPhoto || message.messageType === 'photo') && message.photoData ? (
                    <div className="mb-2">
                      <div className="relative w-full max-w-[250px] h-[200px]">
                        <Image
                          src={arrayBufferToDataUrl(message.photoData)}
                          alt="Paylaşılan fotoğraf"
                          className="rounded"
                          fill
                          style={{ objectFit: 'contain' }}
                          sizes="(max-width: 768px) 100vw, 250px"
                        />
                      </div>
                      {message.message && message.message !== "Fotoğraf gönderildi" && (
                        <p className="mt-2">{message.message}</p>
                      )}
                    </div>
                  ) : (
                    <p>{message.message}</p>
                  )}
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs opacity-70">
                      {new Date(message.timestamp).toLocaleTimeString()}
                    </p>
                    {renderMessageStatus(message)}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="flex flex-col gap-2">
            {isCompressing && (
              <div className={`p-2 border rounded-lg text-center ${darkMode ? 'bg-gray-700 border-gray-600 text-white' : 'bg-gray-100 border-gray-300'}`}>
                <p>Fotoğraf sıkıştırılıyor... %{compressProgress}</p>
                <div className="w-full bg-gray-300 rounded-full h-2.5 mt-2">
                  <div
                    className="bg-blue-600 h-2.5 rounded-full"
                    style={{ width: `${compressProgress}%` }}
                  ></div>
                </div>
              </div>
            )}

            {selectedImage && !isCompressing && (
              <div className={`p-2 border rounded-lg ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
                <div className="flex items-center relative">
                  <div className="w-16 h-16 mr-2 overflow-hidden rounded bg-gray-200 relative">
                    <Image
                      src={URL.createObjectURL(selectedImage)}
                      alt="Seçilen görsel"
                      fill
                      style={{ objectFit: 'cover' }}
                      sizes="64px"
                    />
                    <button
                      onClick={clearSelectedImage}
                      className="absolute -top-1 -right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 focus:outline-none"
                      title="İptal et"
                    >
                      ×
                    </button>
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm truncate max-w-[200px] mb-1">
                      {selectedImage.name}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {(selectedImage.size / (1024 * 1024)).toFixed(2)} MB
                    </span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !isCompressing && handleSend()}
                className={`flex-grow p-2 border rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 ${
                  darkMode ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400' : 'bg-white border-gray-300 text-gray-800 placeholder-gray-400'
                }`}
                placeholder={selectedUser ? (selectedImage ? "Fotoğrafa açıklama ekleyin (opsiyonel)..." : "Mesajınızı yazın...") : "Önce bir kullanıcı seçin"}
                disabled={!selectedUser || isCompressing}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
                disabled={!selectedUser || isCompressing}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedUser || isCompressing}
                className={`py-2 px-4 text-white font-medium rounded-lg focus:outline-none focus:ring-2 ${
                  darkMode
                    ? 'bg-green-700 hover:bg-green-800 focus:ring-green-600 disabled:bg-gray-600'
                    : 'bg-green-600 hover:bg-green-700 focus:ring-green-500 disabled:bg-gray-400'
                }`}
                title="Fotoğraf gönder"
              >
                📷
              </button>
              <button
                onClick={handleSend}
                disabled={!selectedUser || isCompressing || (!input.trim() && !selectedImage)}
                className={`py-2 px-4 text-white font-medium rounded-lg focus:outline-none focus:ring-2 ${
                  darkMode
                    ? 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-600 disabled:bg-gray-600'
                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-gray-400'
                }`}
              >
                Gönder
              </button>
            </div>
          </div>

          <div className="flex gap-4 mt-8">
            <video
              ref={localVideoRef}
              autoPlay
              muted
              className={`w-1/2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
            ></video>
            <video
              ref={remoteVideoRef}
              autoPlay
              className={`w-1/2 rounded-lg ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}
            ></video>
          </div>

          <div className="flex gap-4 mt-8">
            <button
              onClick={initiateCall}
              className={`px-4 py-2 text-white font-medium rounded-lg focus:outline-none focus:ring-2 ${
                darkMode
                  ? 'bg-green-700 hover:bg-green-800 focus:ring-green-600 disabled:bg-gray-600'
                  : 'bg-green-600 hover:bg-green-700 focus:ring-green-500 disabled:bg-gray-400'
              }`}
            >
              Arama Başlat
            </button>
            <button
              onClick={joinCall}
              className={`px-4 py-2 text-white font-medium rounded-lg focus:outline-none focus:ring-2 ${
                darkMode
                  ? 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-600 disabled:bg-gray-600'
                  : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500 disabled:bg-gray-400'
              }`}
            >
              Aramaya Katıl
            </button>
            <button
              onClick={endCall}
              className={`px-4 py-2 text-white font-medium rounded-lg focus:outline-none focus:ring-2 ${
                darkMode
                  ? 'bg-red-700 hover:bg-red-800 focus:ring-red-600 disabled:bg-gray-600'
                  : 'bg-red-600 hover:bg-red-700 focus:ring-red-500 disabled:bg-gray-400'
              }`}
            >
              Aramayı Sonlandır
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
