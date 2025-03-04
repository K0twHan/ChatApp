import { Body, Controller, Get, Post } from '@nestjs/common';
import { UserService } from './user.service';
import { last } from 'rxjs';
import { CreateUserDto } from './userDto/createDto';


@Controller('user')
export class UserController {
    constructor(readonly userService : UserService
    ){}



@Post("register")
    async create(@Body() data :CreateUserDto ): Promise<string> {
        const result = await this.userService.UserRegister(data);
        return JSON.stringify(result);
    }
}
