import { IsString, IsNotEmpty } from 'class-validator';

export class AddUzumTokenDto {
  @IsString()
  @IsNotEmpty()
  token: string;
}