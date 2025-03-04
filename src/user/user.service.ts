import { Injectable } from '@nestjs/common';
import { DbModule } from 'src/db/db.module';
import { PrismaService } from 'src/db/db.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class UserService {


    constructor (readonly DbService : PrismaService) {

    }

    async UserRegister (data : any) {
        var passw = this.HashPassword(data.password);
        if(data.bio == null) {
        return await this.DbService.user.create({
            data : {
                email : data.email,
                password : String(passw),
                name : data.name,
                lastName : data.lastName,
            }
        })
    }

     else {
        return await this.DbService.user.create({
            data : {
                email : data.email,
                password : String(passw),
                name : data.name,
                lastName : data.lastName,
                bio : data.bio
            }
        })
     }
    }
    

    async UserLogin (data : any) {
        const hashedPassword = await this.HashPassword(data.password);
        const user = await this.DbService.user.findUnique({
            where : {
                email : data.email
            }})
        if(user.password == hashedPassword && user ) {
            return user;
        }
        else {
            throw new Error('Invalid password');

        
    }
}


    //Hashing password


    async HashPassword(password: string) : Promise<string> {
        const saltOrRounds = 10; // Cost factor for hashing
        const hash = await bcrypt.hash(password, saltOrRounds); // Hash the password
        return hash;
      }

    }