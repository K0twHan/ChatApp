import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({
    origin: ['https://chat.batuhantekin.info'], // Frontend'in URL'sini ekle
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true, // Eğer Cookie veya Token kullanıyorsan
  });
  const config = new DocumentBuilder()
.setTitle('Cats example')
.setDescription('The cats API description')
.setVersion('1.0')
.addTag('cats')
.addBearerAuth({
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
  name: 'JWT',
  description: 'Enter JWT token',
  in: 'header',
},
'JWT-auth', // This name here is important for matching up with @ApiBearerAuth() in your controller!
)
.build();

const documentFactory = () => SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api', app, documentFactory);
  await app.listen(9900);

}



bootstrap();
