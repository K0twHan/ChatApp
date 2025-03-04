
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
  
    this.userSockets.set(userId, client);
    this.logger.log(`User ${userId} connected`);
  
    // Kullanıcının bekleyen mesajlarını veritabanından çek
    const pendingMessages = await this.DbService.message.findMany({
      where: {
        receiver_id: userId,
        is_read: false,
      },
    });
  
    // Bekleyen mesajları kullanıcıya gönder
    pendingMessages.forEach(async (msg) => {
      client.emit('receive_message', {
        senderId: msg.sender_id,
        message: msg.content,
      });
  
      // Mesajın teslim edildiğini işaretle
      await this.DbService.message.update({
        where: { id: msg.id },
        data: { is_read: true },
      });
    });
  }
  

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
    
    // Bağlantıyı kesildiğinde socket.id'yi Map'ten kaldırıyoruz
    this.userSockets.forEach((socket, userId) => {
      if (socket.id === client.id) {
        this.userSockets.delete(userId);
        this.logger.log(`User ${userId} disconnected`);
      }
    });
  }

@SubscribeMessage('send_message')
async handleMessage(
  @MessageBody() data: { sender_id: string; receiver_id: string; message: string }, @ConnectedSocket() client: Socket
) {
  const { sender_id, receiver_id, message } = data;

  // Alıcı online mı kontrol et
  const receiverSocket = this.userSockets.get(receiver_id);

  if (receiverSocket) {
    // Alıcı online ise mesajı anında gönder
    receiverSocket.emit('receive_message', { sender_id, message });
    this.logger.warn(`Message sent to user ${receiver_id}`);
    // Mesajın teslim edildiğini veritabanında güncelle
    await this.DbService.message.create({
      data: {
        sender_id,
        receiver_id,
        content: message,
        is_read: true, // Mesajın teslim edildiğini belirtiyoruz
      },
    });

    this.logger.log(`Message sent to user ${receiver_id}`);
  } else {
    // Alıcı offline ise mesajı veritabanına kaydet
    await this.DbService.message.create({
      data: {
        sender_id,
        receiver_id,
        content: message,
        is_read: false, // Henüz teslim edilmedi
      },
    });

    this.logger.warn(`User ${receiver_id} is offline. Message saved.`);
  }
}

}