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
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { CursorPaginationDto } from '../../common/dto/cursor-pagination.dto';
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
  @ApiResponse({ status: 201, description: 'File uploaded successfully' })
  @ApiResponse({ status: 400, description: 'Invalid file or payload' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
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
  @ApiResponse({ status: 201, description: 'Pre-signed upload URL created' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async getPresignedUploadUrl(@Body() dto: PresignedUploadDto): Promise<{ uploadUrl: string; attachment: Attachment }> {
    return this.mediaService.getPresignedUploadUrl(dto.filename, dto.mimeType, dto.bookingId, dto.taskId);
  }

  @Post(':id/confirm')
  @ApiOperation({ summary: 'Confirm a pre-signed upload completed' })
  @ApiResponse({ status: 200, description: 'Upload confirmed' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async confirmUpload(@Param('id') id: string, @Body('size') size: number): Promise<Attachment> {
    return this.mediaService.confirmUpload(id, size);
  }

  @Post()
  @ApiOperation({ summary: 'Link an external URL as an attachment' })
  @ApiResponse({ status: 201, description: 'Attachment linked successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async create(@Body() dto: LinkAttachmentDto): Promise<Attachment> {
    return this.mediaService.create(dto);
  }

  @Get()
  @ApiOperation({
    summary: 'Get all attachments (Offset Pagination)',
    deprecated: true,
    description: 'Use /media/cursor for better performance with large datasets.',
  })
  @ApiResponse({ status: 200, description: 'Attachments retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async findAll(@Query() query: PaginationDto = new PaginationDto()): Promise<Attachment[]> {
    return this.mediaService.findAll(query);
  }

  @Get('cursor')
  @ApiOperation({ summary: 'Get all attachments with cursor pagination' })
  @ApiResponse({ status: 200, description: 'Attachments retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  async findAllCursor(@Query() query: CursorPaginationDto): Promise<{ data: Attachment[]; nextCursor: string | null }> {
    return this.mediaService.findAllCursor(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get attachment by ID' })
  @ApiResponse({ status: 200, description: 'Attachment retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async findOne(@Param('id') id: string): Promise<Attachment> {
    return this.mediaService.findOne(id);
  }

  @Get(':id/download-url')
  @ApiOperation({ summary: 'Get a pre-signed download URL' })
  @ApiResponse({ status: 200, description: 'Download URL retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async getDownloadUrl(@Param('id') id: string): Promise<{ url: string }> {
    const url = await this.mediaService.getDownloadUrl(id);
    return { url };
  }

  @Get('booking/:id')
  @ApiOperation({ summary: 'Get attachments for a booking' })
  @ApiResponse({ status: 200, description: 'Attachments retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Booking not found' })
  async findByBooking(@Param('id') id: string): Promise<Attachment[]> {
    return this.mediaService.findByBooking(id);
  }

  @Get('task/:id')
  @ApiOperation({ summary: 'Get attachments for a task' })
  @ApiResponse({ status: 200, description: 'Attachments retrieved' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  async findByTask(@Param('id') id: string): Promise<Attachment[]> {
    return this.mediaService.findByTask(id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete an attachment and its file' })
  @ApiResponse({ status: 200, description: 'Attachment deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden - Insufficient permissions' })
  @ApiResponse({ status: 404, description: 'Attachment not found' })
  async remove(@Param('id') id: string): Promise<void> {
    return this.mediaService.remove(id);
  }
}
