import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseWsExceptionFilter } from '@nestjs/websockets';
import { Socket } from 'socket.io';
import { WS } from './chat.events';

/** Turns thrown errors (incl. 403 from the connection gate) into a socket error event. */
@Catch()
export class WsExceptionFilter extends BaseWsExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const client = host.switchToWs().getClient<Socket>();
    const message =
      exception instanceof HttpException ? exception.message : 'Unexpected error';
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    client.emit(WS.ERROR, { status, message });
  }
}
