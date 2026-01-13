import {
  Body,
  Controller,
  Delete,
  Get,
  MaxFileSizeValidator,
  Param,
  ParseFilePipe,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PaginationDto } from '../../common/dto/pagination.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CreateAttachmentDto, LinkAttachmentDto, PresignedUploadDto } from './dto';
import { Attachment } from './entities/attachment.entity';
import { MediaService } from './media.service';

@ApiTags('Media')
@ApiBearerAuth()
@Controller('media')
@UseGuards(JwtAuthGuard)
export class MediaController {
  // Security: 10MB file size limit
  private static readonly MAX_FILE_SIZE = 10 * 1024 * 1024;

  constructor(private readonly mediaService: MediaService) {}

  @Post('upload')
  @ApiOperation({ summary: 'Upload a file directly (max 10MB)' })
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
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 })],
        fileIsRequired: true,
      }),
    )
    file: Express.Multer.File,
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
  async getPresignedUploadUrl(@Body() dto: PresignedUploadDto): Promise<{ uploadUrl: string; attachment: Attachment }> {
    return this.mediaService.getPresignedUploadUrl(dto.filename, dto.mimeType, dto.bookingId, dto.taskId);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a pre-signed upload completed' })
  async confirmUpload(@Param('id') id: string, @Body('size') size: number): Promise<Attachment> {
    return this.mediaService.confirmUpload(id, size);
  }

  @Post()
  @ApiOperation({ summary: 'Link an external URL as an attachment' })
  async create(@Body() dto: LinkAttachmentDto): Promise<Attachment> {
    return this.mediaService.create(dto);
  }

  @Get()
  @ApiOperation({ summary: 'Get all attachments' })
  async findAll(@Query() query: PaginationDto = new PaginationDto()): Promise<Attachment[]> {
    return this.mediaService.findAll(query);
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
