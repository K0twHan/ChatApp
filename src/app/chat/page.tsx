"use client";
import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from 'next/image';
import type { Socket } from "socket.io-client";

type Message = {
  senderId: string;
  message: string;
  timestamp: Date;
  isRead?: boolean;
  isDelivered?: boolean;
  isPhoto?: boolean;
  photoData?: ArrayBuffer;
};

type User = {
  id: string;
  name: string;
  lastName: string;
  email?: string;
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
}

interface ReceiveMessageData {
  senderId: string;
  message: string;
  timestamp?: string;
}

interface ReceivePhotoData {
  senderId: string;
  photo: ArrayBuffer;
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
  emit(event: "send_message", data: { receiver_id: string; message: string }): this;
  emit(event: "send_photo", data: { receiver_id: string; photo: ArrayBuffer }): this;
  emit(event: "get_chat_history", data: { user_id: string }): this;
  emit(event: "unread_message"): this;
  emit(event: "read_messages", data: { sender_id: string }): this;
  
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

  // Update the ref whenever selectedUser changes
  useEffect(() => {
    selectedUserRef.current = selectedUser;
    
    // When a user is selected, mark their messages as read
    if (selectedUser && socket) {
      socket.emit("read_messages", { sender_id: selectedUser });
    }
  }, [selectedUser, socket]);

  // Auto-scroll to bottom of messages
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    // Check if we're in the browser environment
    if (typeof window === "undefined") return;
    
    const token = localStorage.getItem("token");
    if (!token) {
      // Redirect to home page if no token is found
      router.push("/");
      return;
    }

    try {
      // Extract user ID from JWT token for display purposes
      const tokenPayload = JSON.parse(atob(token.split('.')[1]));
      setCurrentUserId(tokenPayload.sub);
    } catch (error) {
      console.error("Error parsing token:", error);
    }

    // Connect to socket with token for authentication
    import('socket.io-client').then(({ io }) => {
      const socketIo = io("https://api.batuhantekin.info", {
        query: { token },
        transports: ['websocket'],
      }) as CustomSocket;

      socketIo.on("connect", () => {
        console.log("WebSocket connection established");
        
        // Request both full and online user lists when connected
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

      // Handle full user list
      socketIo.on("full_user_list", (userListData: User[]) => {
        console.log("Received full user list:", userListData);
        if (Array.isArray(userListData)) {
          // Filter out current user
          setAllUsers(userListData.filter(user => user && user.id !== currentUserId));
        }
      });

      // Handle online users
      socketIo.on("online_users", (userListData: User[]) => {
        console.log("Received online users:", userListData);
        if (Array.isArray(userListData)) {
          // Filter out current user
          setOnlineUsers(userListData.filter(user => user && user.id !== currentUserId));
        }
      });

      // Handle unread messages data
      socketIo.on("unread_messages", (unreadData: UnreadMessageCount[]) => {
        console.log("Unread messages received:", unreadData);
        const unreadCounts: Record<string, number> = {};
        
        unreadData.forEach(item => {
          unreadCounts[item.sender_id] = item._count.id;
        });
        
        setUnreadMessages(unreadCounts);
      });

      // Handle when receiver reads our messages
      socketIo.on("message_read", (data: { by: string }) => {
        console.log(`Messages read by user ${data.by}`);
        
        // If this is about the currently selected chat, update read status
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
          // Format message history and add to state
          const formattedMessages = historyData.map(msg => ({
            senderId: msg.sender_id,
            message: msg.content || msg.message || "",
            timestamp: new Date(msg.createdAt ?? msg.created_at ?? msg.timestamp ?? Date.now()),
            isRead: msg.is_read || false,
            isDelivered: msg.is_delivered || false
          }));
          
          // Sort messages by timestamp
          formattedMessages.sort((a, b) => 
            a.timestamp.getTime() - b.timestamp.getTime()
          );
          
          setMessages(formattedMessages);
        } else {
          // Clear messages if no history
          setMessages([]);
        }
      });

      socketIo.on("receive_message", (data: ReceiveMessageData) => {
        console.log("Message received:", data);
        console.log("Currently selected user:", selectedUserRef.current);
      
        // Play notification sound if message is not from currently selected user
        if (data.senderId !== selectedUserRef.current) {
          if (notificationRef.current) {
            notificationRef.current.play().catch(err => console.error("Bildirim sesi çalınamadı:", err));
            
            // Show browser notification if supported
            if (Notification.permission === "granted") {
              const user = allUsers.find(u => u.id === data.senderId);
              const userName = user ? `${user.name} ${user.lastName}` : "Yeni mesaj";
              
              new Notification("Yeni Mesaj", {
                body: `${userName}: ${data.message}`,
                icon: "/notification-icon.png"
              });
            }
          }
          
          // If message is from someone else, request updated unread counts
          socketIo.emit("unread_message");
        } else {
          // If the message is from the currently selected user, add it to the chat
          setMessages(prevMessages => [...prevMessages, {
            senderId: data.senderId,
            message: data.message,
            timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
            isDelivered: true,
            isRead: false
          }]);
          
          // Mark messages as read since we're already in this chat
          socketIo.emit("read_messages", { sender_id: data.senderId });
        }
      });

      // Handle receiving photos
      socketIo.on("receive_photo", (data: ReceivePhotoData) => {
        console.log("Photo received:", data);
        
        // Play notification sound if photo is not from currently selected user
        if (data.senderId !== selectedUserRef.current) {
          if (notificationRef.current) {
            notificationRef.current.play().catch(err => console.error("Bildirim sesi çalınamadı:", err));
            
            // Show browser notification if supported
            if (Notification.permission === "granted") {
              const user = allUsers.find(u => u.id === data.senderId);
              const userName = user ? `${user.name} ${user.lastName}` : "Yeni mesaj";
              
              new Notification("Yeni Fotoğraf", {
                body: `${userName} bir fotoğraf gönderdi`,
                icon: "/notification-icon.png"
              });
            }
          }
          
          // If photo is from someone else, request updated unread counts
          socketIo.emit("unread_message");
        } else {
          // If the photo is from the currently selected user, add it to the chat
          setMessages(prevMessages => [...prevMessages, {
            senderId: data.senderId,
            message: "Fotoğraf gönderdi",
            timestamp: new Date(),
            isDelivered: true,
            isRead: false,
            isPhoto: true,
            photoData: data.photo
          }]);
          
          // Mark messages as read since we're already in this chat
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

  // Request notification permissions on component mount
  useEffect(() => {
    if (Notification.permission !== "granted" && Notification.permission !== "denied") {
      Notification.requestPermission();
    }
  }, []);

  // Refresh user lists
  const refreshUserLists = () => {
    if (socket) {
      console.log("Manually refreshing user lists...");
      socket.emit("full_user_list");
      socket.emit("online_user_list");
      socket.emit("unread_message");
    }
  };

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedImage(e.target.files[0]);
    }
  };

  const clearSelectedImage = () => {
    setSelectedImage(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Combined function to handle sending both messages and photos
  const handleSend = async () => {
    if (!socket || !selectedUser) {
      alert("Lütfen bir kullanıcı seçiniz.");
      return;
    }

    // If there's an image selected, send that first
    if (selectedImage) {
      try {
        const arrayBuffer = await selectedImage.arrayBuffer();
        
        socket.emit("send_photo", {
          receiver_id: selectedUser,
          photo: arrayBuffer
        });

        // Add photo to local state for immediate display
        setMessages(prevMessages => [...prevMessages, {
          senderId: currentUserId,
          message: "Fotoğraf gönderildi",
          timestamp: new Date(),
          isDelivered: isUserOnline(selectedUser),
          isRead: false,
          isPhoto: true,
          photoData: arrayBuffer
        }]);

        // Clear the selected image
        clearSelectedImage();
      } catch (error) {
        console.error("Error sending photo:", error);
        alert("Fotoğraf gönderilirken bir hata oluştu.");
      }
    }

    // If there's text, send it as a message
    if (input.trim()) {
      const messageData = {
        receiver_id: selectedUser,
        message: input,
      };
      
      socket.emit("send_message", messageData);
      
      // Add message to local state for immediate display
      setMessages(prevMessages => [...prevMessages, {
        senderId: currentUserId,
        message: input,
        timestamp: new Date(),
        isDelivered: isUserOnline(selectedUser),
        isRead: false
      }]);
      
      setInput("");
    }
  };

  const handleUserSelect = (userId: string) => {
    setSelectedUser(userId);
    // Clear messages when user selection changes
    setMessages([]);
    
    // Request chat history with selected user
    if (socket) {
      console.log(`Requesting chat history with ${userId}...`);
      socket.emit("get_chat_history", { user_id: userId });
      
      // Mark messages from this user as read
      socket.emit("read_messages", { sender_id: userId });
    }
  };

  // Check if a user is online
  const isUserOnline = (userId: string): boolean => {
    return onlineUsers.some(user => user.id === userId);
  };

  // Get user's full name
  const getUserFullName = (userId: string) => {
    const user = allUsers.find(u => u.id === userId);
    return user ? `${user.name} ${user.lastName}` : userId;
  };

  // Render message status indicators with WhatsApp-style icons
  const renderMessageStatus = (message: Message) => {
    if (message.senderId !== currentUserId) return null;
    
    if (message.isRead) {
      // Double green checkmarks for read (WhatsApp style)
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
      // Double gray checkmarks for delivered (WhatsApp style)
      return (
        <span className="text-xs text-gray-400 ml-1" title="İletildi">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
            <path d="M12.736 3.97a.733.733 0 0 1 1.047 0c.286.289.29.756.01 1.05L7.88 12.01a.733.733 0 0 1-1.065.02L3.217 8.384a.757.757 0 0 1 0-1.06.733.733 0 0 1 1.047 0l3.052 3.093 5.4-6.425a.247.247 0 0 1 .02-.022Z"/>
            <path d="M10.97 4.97a.75.75 0 0 1 1.07 1.05l-3.99 4.99a.75.75 0 0 1-1.08.02L4.324 8.384a.75.75 0 1 1 1.06-1.06l2.094 2.093 3.473-4.425a.267.267 0 0 1 .02-.022z"/>
          </svg>
        </span>
      );
    }
    
    // Clock icon for sent (WhatsApp style)
    return (
      <span className="text-xs text-gray-300 ml-1" title="Gönderildi">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 16 16">
          <path d="M8 3.5a.5.5 0 0 0-1 0V9a.5.5 0 0 0 .252.434l3.5 2a.5.5 0 0 0 .496-.868L8 8.71V3.5z"/>
          <path d="M8 16A8 8 0 1 0 8 0a8 8 0 0 0 0 16zm7-8A7 7 0 1 1 1 8a7 7 0 0 1 14 0z"/>
        </svg>
      </span>
    );
  };

  // Helper function to convert ArrayBuffer to data URL for display
  const arrayBufferToDataUrl = (buffer: ArrayBuffer, type = 'image/jpeg') => {
    const blob = new Blob([buffer], { type });
    return URL.createObjectURL(blob);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4 bg-gray-50">
      {/* Notification sound element */}
      <audio ref={notificationRef} src="/message-notification.mp3" />
      
      <div className="w-full max-w-6xl bg-white shadow-lg rounded-lg p-4 flex flex-col md:flex-row gap-4">
        {/* User List Panel */}
        <div className="w-full md:w-1/4 border rounded-lg p-4 bg-gray-100">
          <h3 className="text-xl font-semibold mb-4 text-gray-800">Kullanıcılar</h3>
          {allUsers.length === 0 ? (
            <div className="text-gray-500 text-center p-4">Kullanıcı bulunamadı</div>
          ) : (
            <ul className="space-y-2">
              {allUsers.map((user) => {
                const isOnline = isUserOnline(user.id);
                const unreadCount = unreadMessages[user.id] || 0;
                
                return (
                  <li 
                    key={user.id} 
                    className={`p-2 rounded-md cursor-pointer hover:bg-gray-200 flex items-center justify-between ${
                      selectedUser === user.id ? "bg-blue-100 border-l-4 border-blue-500 text-gray-800" : "text-gray-700"
                    }`}
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
            className="w-full mt-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
            onClick={refreshUserLists}
          >
            Kullanıcı Listesini Yenile
          </button>
        </div>
        
        {/* Chat Panel */}
        <div className="w-full md:w-3/4 flex flex-col">
          <h2 className="text-2xl font-bold mb-4 text-gray-800">
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
          
          <div className="flex flex-col gap-4 mb-4 overflow-y-auto h-96 border border-gray-300 rounded-lg p-4 bg-gray-50">
            {messages.length === 0 ? (
              <div className="text-gray-500 text-center p-4">
                {selectedUser ? "Bu kullanıcı ile sohbet başlatın" : "Sohbet etmek için bir kullanıcı seçin"}
              </div>
            ) : (
              messages.map((message, index) => (
                <div 
                  key={index} 
                  className={`p-3 rounded-lg max-w-[80%] ${
                    message.senderId === currentUserId 
                      ? "bg-blue-500 text-white self-end" 
                      : "bg-gray-200 text-gray-800 self-start"
                  }`}
                >
                  {message.isPhoto && message.photoData ? (
                    <div className="mb-2 relative w-full max-w-[250px] h-[200px]">
                      <Image 
                        src={arrayBufferToDataUrl(message.photoData)} 
                        alt="Paylaşılan fotoğraf" 
                        className="rounded"
                        fill
                        style={{ objectFit: 'contain' }}
                        sizes="(max-width: 768px) 100vw, 250px"
                      />
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
          
          {/* Unified message input form */}
          <div className="flex flex-col gap-2">
            {selectedImage && (
              <div className="p-2 border border-gray-300 rounded-lg bg-gray-50">
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
                  <span className="text-sm text-gray-600 truncate max-w-[200px]">
                    {selectedImage.name}
                  </span>
                </div>
              </div>
            )}
            
            <div className="flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                className="flex-grow p-2 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-800 placeholder-gray-400"
                placeholder={selectedUser ? (selectedImage ? "Fotoğrafa açıklama ekleyin (opsiyonel)..." : "Mesajınızı yazın...") : "Önce bir kullanıcı seçin"}
                disabled={!selectedUser}
              />
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleImageSelect}
                accept="image/*"
                className="hidden"
                disabled={!selectedUser}
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={!selectedUser}
                className="py-2 px-4 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-400"
                title="Fotoğraf gönder"
              >
                📷
              </button>
              <button
                onClick={handleSend}
                disabled={!selectedUser || (!input.trim() && !selectedImage)}
                className="py-2 px-4 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-400"
              >
                Gönder
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
