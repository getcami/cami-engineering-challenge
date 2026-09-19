import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn } from 'typeorm';
import { ClassificationCategory } from './classifier.provider';

/**
 * Append-only record of one classification run. Immutable by design: it is an
 * audit trail, so nothing updates these rows after insert.
 *
 * `message` is a snapshot of the text that was classified (the source request
 * could be edited later). `category`/`confidence` are the final values after
 * policy; `rawCategory`/`rawConfidence` are what the provider returned, kept so a
 * future LLM provider can be evaluated against the policy layer.
 *
 * `requestId` is null for ad-hoc classifications and if the source request is
 * later deleted (FK is ON DELETE SET NULL, history outlives the request).
 */
@Entity({ name: 'classifications' })
export class Classification {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'request_id', type: 'uuid', nullable: true })
  requestId!: string | null;

  @Column({ type: 'text' })
  message!: string;

  @Column({ type: 'varchar', length: 32 })
  category!: ClassificationCategory;

  @Column({ type: 'float' })
  confidence!: number;

  @Column({ name: 'raw_category', type: 'varchar', length: 32 })
  rawCategory!: ClassificationCategory;

  @Column({ name: 'raw_confidence', type: 'float' })
  rawConfidence!: number;

  @Column({ type: 'varchar', length: 64 })
  provider!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
