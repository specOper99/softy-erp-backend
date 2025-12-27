import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAttachmentDto, PresignedUploadDto } from './dto';
import { Attachment } from './entities/attachment.entity';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file directly' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        bookingId: { type: 'string', nullable: true },
        taskId: { type: 'string', nullable: true },
      },
    },
  })
  @UseInterceptors(FileInterceptor('file'))
  async uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: CreateAttachmentDto,
  ): Promise<Attachment> {
    return this.mediaService.uploadFile({
      buffer: file.buffer,
      originalName: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      bookingId: dto.bookingId,
      taskId: dto.taskId,
    });
  }

  @Post('presigned-upload')
  @ApiOperation({
    summary: 'Get a pre-signed URL for direct upload to storage',
  })
  async getPresignedUploadUrl(
    @Body() dto: PresignedUploadDto,
  ): Promise<{ uploadUrl: string; attachment: Attachment }> {
    return this.mediaService.getPresignedUploadUrl(
      dto.filename,
      dto.mimeType,
      dto.bookingId,
      dto.taskId,
    );
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a pre-signed upload completed' })
  async confirmUpload(
    @Param('id') id: string,
    @Body('size') size: number,
  ): Promise<Attachment> {
    return this.mediaService.confirmUpload(id, size);
  }

  @Post()
  @ApiOperation({ summary: 'Link an external URL as an attachment' })
  async create(@Body() data: Partial<Attachment>): Promise<Attachment> {
    return this.mediaService.create(data);
  }

  @Get()
  @ApiOperation({ summary: 'Get all attachments' })
  async findAll(): Promise<Attachment[]> {
    return this.mediaService.findAll();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attachment by ID' })
  async findOne(@Param('id') id: string): Promise<Attachment> {
    return this.mediaService.findOne(id);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get a pre-signed download URL' })
  async getDownloadUrl(@Param('id') id: string): Promise<{ url: string }> {
    const url = await this.mediaService.getDownloadUrl(id);
    return { url };
  }

  @Get('booking/:id')
  @ApiOperation({ summary: 'Get attachments for a booking' })
  async findByBooking(@Param('id') id: string): Promise<Attachment[]> {
    return this.mediaService.findByBooking(id);
  }

  @Get('task/:id')
  @ApiOperation({ summary: 'Get attachments for a task' })
  async findByTask(@Param('id') id: string): Promise<Attachment[]> {
    return this.mediaService.findByTask(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attachment and its file' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.mediaService.remove(id);
  }
}
