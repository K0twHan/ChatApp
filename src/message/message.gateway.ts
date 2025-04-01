import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import {
    ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from "@nestjs/websockets";

import { Server, Socket } from "socket.io";
import { jwtConstants } from "src/auth/costants";
import { PrismaService } from "src/db/db.service";

@WebSocketGateway()
export class ChatGateway
  implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect
{
    private userSockets = new Map<string, Socket>();
    constructor(private readonly DbService: PrismaService, private readonly JwtService : JwtService) {}
  private readonly logger = new Logger('ChatGateway');

  @WebSocketServer() io: Server;
  

  afterInit() {
    this.logger.log("Initialized");
  }

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  
    const token = client.handshake.query.token as string;
    if (!token) {
        this.logger.warn('Token not provided');
      client.disconnect();
      return ;
    }
  
    let userId: string;
    try {
      const decoded = await this.JwtService.verify(token,{secret : jwtConstants.secret});
      userId = decoded.sub;
    } catch (error) {
        this.logger.error('Invalid or expired token',error);
      client.disconnect();
      return;
    }
  
    const user = await this.DbService.user.findUnique({
      where: { id: userId },
    });
  
    if (!user) {
      client.disconnect();
      return;
    }
    client.data.userId = userId;
    this.userSockets.set(userId, client);
    this.logger.log(`User ${userId} connected`);
  
    // Kullanıcının bekleyen mesajlarını veritabanından çek
    const pendingMessages = await this.DbService.message.findMany({
      where: {
        receiver_id: userId,
        is_read: false,
        is_delivered: false,
      },
    });
  
    // Bekleyen mesajları kullanıcıya gönder
    pendingMessages.forEach(async (msg) => {
      // Mesaj tipine göre farklı veri gönder
      if (msg.message_type === 'photo' && msg.photo_data) {
        client.emit('receive_photo', {
          senderId: msg.sender_id,
          photo: msg.photo_data,
          message: msg.content, // Fotoğraf ile birlikte gönderilen mesajı da ekleyelim
          messageType: 'photo'
        });
      } else {
        client.emit('receive_message', {
          senderId: msg.sender_id,
          message: msg.content,
          messageType: msg.message_type
        });
      }
  
      // Mesajın teslim edildiğini işaretle
      await this.DbService.message.update({
        where: { id: msg.id },
        data: { is_delivered: true },
      });
    });
  }
  

async  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Bağlantıyı kesildiğinde socket.id'yi Map'ten kaldırıyoruz
    this.userSockets.forEach((socket, userId) => {
      if (socket.id === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} disconnected`);
      }
    });
  }

  @SubscribeMessage('unread_message')
  async handleUnreadMessages(@ConnectedSocket() client : Socket) {
    const userId = client.data.userId;
    if (!userId) {
      this.logger.warn('User ID not found');
      return;
    }
  
    const unreadMessages = await this.DbService.message.groupBy({
    by : ['sender_id'],
    where: {
      receiver_id: userId,
      is_read: false,
      is_delivered : true,
    },
    _count: {
      id : true
    },
    
    })
    this.logger.log(`Unread messages requested for user ${userId}`);
    this.logger.log(`Unread messages count: ${unreadMessages}`);
    client.emit('unread_messages', unreadMessages);
  }

  @SubscribeMessage('read_messages')
async handleReadMessages(@MessageBody() data: { sender_id: string }, @ConnectedSocket() client: Socket) {
  const receiver_id = client.data.userId;
  if (!receiver_id) return;

  await this.DbService.message.updateMany({
    where: {
      sender_id: data.sender_id,
      receiver_id: receiver_id,
      is_read: false,
    },
    data: { is_read: true },
  });

  this.logger.log(`Messages from ${data.sender_id} marked as read`);

  // Frontend'e güncellenmiş unread count'u göndermek için
  this.handleUnreadMessages(client);
}






  //bu sayede bütün kullanıcılara erişebilicez

@SubscribeMessage('full_user_list')
async handleFullUserList() {
  const users = await this.DbService.user.findMany({
    select: {
      id: true,
      name: true,
      lastName: true,
      email: true,
    },
  });

  this.logger.log(`Full user list requested`);
  this.io.emit('full_user_list', users);
}


@SubscribeMessage('online_user_list')
async handleUserList() {

  
  const userList = Array.from(this.userSockets.keys());
  const user_name =await this.DbService.user.findMany({
    where: {
      id: {
        in: userList,
      },
    },
    select : {id : true , name : true, lastName : true}
  });
  
  this.logger.log(`User list requested: ${userList}`);
  //this.logger.log(`User list requested: ${user_name}`);
  //this.io.emit('user_list' , userList );
  this.io.emit('online_users', user_name );
}


@SubscribeMessage('send_message')
async handleMessage(
  @MessageBody() data: { receiver_id: string; message: string; messageType?: string }, 
  @ConnectedSocket() client: Socket
) {
  const { receiver_id, message } = data;
  const messageType = data.messageType || 'text';
  const senderId = client.data.userId;
  
  // Alıcı online mı kontrol et
  const receiverSocket = this.userSockets.get(receiver_id);
  if (receiverSocket) {
    // Alıcı online ise mesajı anında gönder
    receiverSocket.emit('receive_message', { 
      senderId, 
      message, 
      messageType 
    });
    
    // Mesajın teslim edildiğini veritabanında güncelle
    await this.DbService.message.create({
      data: {
        sender_id: senderId,
        receiver_id,
        content: message,
        message_type: messageType,
        is_delivered: true,
        is_read: false
      },
    });

    this.logger.log(`Message sent to user ${receiver_id}`);
  } else {
    // Alıcı offline ise mesajı veritabanına kaydet
    await this.DbService.message.create({
      data: {
        sender_id: senderId,
        receiver_id,
        content: message,
        message_type: messageType,
        is_read: false,
        is_delivered: false,
      },
    });

    this.logger.warn(`User ${receiver_id} is offline. Message saved.`);
  }
}

@SubscribeMessage('get_chat_history')
async handleGetChatHistory(
  @MessageBody() data: { user_id: string },
  @ConnectedSocket() client: Socket
) {
  const currentUserId = client.data.userId;
  const otherUserId = data.user_id;
  
  if (!currentUserId || !otherUserId) {
    return;
  }
  
  // İki kullanıcı arasındaki tüm mesajları getir
  const messages = await this.DbService.message.findMany({
    where: {
      OR: [
        {
          sender_id: currentUserId,
          receiver_id: otherUserId
        },
        {
          sender_id: otherUserId,
          receiver_id: currentUserId
        }
      ]
    },
    orderBy: {
      createdAt: 'asc'
    }
  });
  
  // Sadece ilgili kullanıcıya mesaj geçmişini gönder
  client.emit('chat_history', messages);
  
  // Karşı tarafa gönderilen mesajları "okundu" olarak işaretle
  await this.DbService.message.updateMany({
    where: {
      sender_id: otherUserId,
      receiver_id: currentUserId,
      is_read: false,
      is_delivered: true,
    },
    data: {
      is_read: true
    }
  });

  // handleGetChatHistory metodunda, mesajları okundu olarak işaretledikten sonra:
  const senderSocket = this.userSockets.get(otherUserId);
  if (senderSocket) {
    senderSocket.emit('message_read', { by: currentUserId });
  }
}


@SubscribeMessage('send_photo')
async handlePhoto(
  @MessageBody() data: { receiver_id: string; photo: ArrayBuffer; message?: string }, 
  @ConnectedSocket() client: Socket
) {
  const { receiver_id, photo, message } = data;
  const senderId = client.data.userId;
  
  // Photo data'yı Uint8Array'e çevir (ArrayBuffer'dan)
  const photoBytes = new Uint8Array(photo);
  
  // Alıcı online mı kontrol et
  const receiverSocket = this.userSockets.get(receiver_id);
  
  if (receiverSocket) {
    // Alıcı online ise fotoğrafı ve varsa mesajı anında gönder
    receiverSocket.emit('receive_photo', { 
      senderId, 
      photo,
      message,
      messageType: 'photo'
    });
    
    // Veritabanına kaydet (iletildi olarak)
    await this.DbService.message.create({
      data: {
        sender_id: senderId,
        receiver_id,
        content: message, // Eğer mesaj varsa kaydedilecek
        photo_data: Buffer.from(photoBytes),
        message_type: 'photo',
        is_delivered: true,
        is_read: false
      },
    });
    
    this.logger.log(`Photo delivered to user ${receiver_id}${message ? ' with message' : ''}`);
  } else {
    // Alıcı offline ise fotoğrafı ve varsa mesajı veritabanına kaydet
    await this.DbService.message.create({
      data: {
        sender_id: senderId,
        receiver_id,
        content: message,
        photo_data: Buffer.from(photoBytes),
        message_type: 'photo',
        is_delivered: false,
        is_read: false
      },
    });
    
    this.logger.warn(`User ${receiver_id} is offline. Photo${message ? ' and message' : ''} saved to database.`);
  }
}

@SubscribeMessage('offer')
handleOffer(@MessageBody() data: { senderId: string, receiverId: string, offer: any }, @ConnectedSocket() client: Socket) {
  this.logger.log(`Offer from ${data.senderId} to ${data.receiverId}`);
  // Kullanıcı ID'sine göre alıcının socket'ini bul
  const receiverSocket = this.userSockets.get(data.receiverId);
  if (receiverSocket) {
    receiverSocket.emit('offer', {
      senderId: data.senderId,
      receiverId: data.receiverId,
      offer: data.offer
    });
    this.logger.log(`Offer sent to ${data.receiverId}`);
  } else {
    client.emit('call_error', { message: `Kullanıcı ${data.receiverId} çevrimiçi değil.` });
    this.logger.warn(`Receiver ${data.receiverId} not online to receive offer`);
  }
}

@SubscribeMessage('answer')
handleAnswer(@MessageBody() data: { senderId: string, receiverId: string, answer: any }, @ConnectedSocket() client: Socket) {
  this.logger.log(`Answer from ${data.senderId} to ${data.receiverId}`);
  // Kullanıcı ID'sine göre alıcının socket'ini bul
  const receiverSocket = this.userSockets.get(data.receiverId);
  if (receiverSocket) {
    receiverSocket.emit('answer', {
      senderId: data.senderId,
      receiverId: data.receiverId,
      answer: data.answer
    });
    this.logger.log(`Answer sent to ${data.receiverId}`);
  } else {
    this.logger.warn(`Receiver ${data.receiverId} not online to receive answer`);
  }
}

@SubscribeMessage('candidate')
handleCandidate(@MessageBody() data: { senderId: string, receiverId: string, candidate: any }, @ConnectedSocket() client: Socket) {
  this.logger.log(`ICE Candidate from ${data.senderId} to ${data.receiverId}`);
  // Kullanıcı ID'sine göre alıcının socket'ini bul
  const receiverSocket = this.userSockets.get(data.receiverId);
  if (receiverSocket) {
    receiverSocket.emit('candidate', {
      senderId: data.senderId,
      receiverId: data.receiverId,
      candidate: data.candidate
    });
    this.logger.log(`ICE candidate sent to ${data.receiverId}`);
  } else {
    this.logger.warn(`Receiver ${data.receiverId} not online to receive ICE candidate`);
  }
}

@SubscribeMessage('call_request')
handleCallRequest(@MessageBody() data: { receiverId: string }, @ConnectedSocket() client: Socket) {
  const senderId = client.data.userId;
  if (!senderId) return;
  
  const receiverSocket = this.userSockets.get(data.receiverId);
  if (receiverSocket) {
    // Karşı tarafa arama isteği gönder
    receiverSocket.emit('call_request', {
      senderId: senderId,
      senderName: client.data.userName || "Bilinmeyen Kullanıcı"
    });
    this.logger.log(`Call request sent from ${senderId} to ${data.receiverId}`);
  } else {
    client.emit('call_error', { message: `Kullanıcı çevrimiçi değil.` });
    this.logger.warn(`User ${data.receiverId} is not online for call request`);
  }
}

@SubscribeMessage('call_response')
handleCallResponse(@MessageBody() data: { senderId: string, accepted: boolean }, @ConnectedSocket() client: Socket) {
  const receiverId = client.data.userId;
  if (!receiverId) return;
  
  const senderSocket = this.userSockets.get(data.senderId);
  if (senderSocket) {
    senderSocket.emit('call_response', {
      receiverId: receiverId,
      accepted: data.accepted
    });
    this.logger.log(`Call ${data.accepted ? 'accepted' : 'rejected'} by ${receiverId}`);
  } else {
    this.logger.warn(`User ${data.senderId} is no longer online`);
  }
}

@SubscribeMessage('end_call')
handleEndCall(@MessageBody() data: { peerId: string }, @ConnectedSocket() client: Socket) {
  const userId = client.data.userId;
  if (!userId) return;
  
  const peerSocket = this.userSockets.get(data.peerId);
  if (peerSocket) {
    peerSocket.emit('call_ended', { by: userId });
    this.logger.log(`Call ended by ${userId}`);
  }
}

@SubscribeMessage('join_call')
handleJoinCall(@MessageBody() data: { senderId: string; receiverId: string }, @ConnectedSocket() client: Socket) {
  const receiverSocket = this.userSockets.get(data.receiverId);
  if (receiverSocket) {
    receiverSocket.emit('join_call', { senderId: data.senderId, receiverId: data.receiverId });
    this.logger.log(`User ${data.senderId} joined the call with ${data.receiverId}`);
  } else {
    this.logger.warn(`User ${data.receiverId} is not online to join the call`);
  }
}

}
