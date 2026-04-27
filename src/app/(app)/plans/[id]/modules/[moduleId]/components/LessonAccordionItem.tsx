'use client';

import {
	CheckCircle2,
	Clock,
	ExternalLink,
	FileText,
	Link as LinkIcon,
	Lock,
	PlayCircle,
	Target,
} from 'lucide-react';
import { type ElementType, type JSX, useMemo } from 'react';
import {
	type ContentBlock,
	generatePlaceholderContent,
	hashString,
} from '@/app/(app)/plans/[id]/modules/[moduleId]/components/placeholder-content';
import {
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { formatMinutes } from '@/features/plans/formatters';
import type { TaskWithRelations } from '@/lib/db/queries/types/modules.types';
import type { ProgressStatus, ResourceType } from '@/shared/types/db.types';
import { TaskStatusButton } from './TaskStatusButton';

interface LessonAccordionItemProps {
	lesson: TaskWithRelations;
	status: ProgressStatus;
	onStatusChange: (taskId: string, nextStatus: ProgressStatus) => void;
	/** Whether this lesson is locked (previous lessons/modules not complete) */
	isLocked?: boolean;
}

const RESOURCE_CONFIG: Record<
	ResourceType,
	{ label: string; icon: ElementType; badgeClass: string }
> = {
	video: {
		label: 'Video',
		icon: PlayCircle,
		badgeClass:
			'bg-red-500/10 text-red-600 dark:bg-red-500/20 dark:text-red-400',
	},
	article: {
		label: 'Article',
		icon: FileText,
		badgeClass:
			'bg-blue-500/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400',
	},
	course: {
		label: 'Course',
		icon: Target,
		badgeClass:
			'bg-amber-500/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400',
	},
	doc: {
		label: 'Documentation',
		icon: FileText,
		badgeClass:
			'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary',
	},
	other: {
		label: 'Resource',
		icon: LinkIcon,
		badgeClass: 'bg-muted text-muted-foreground dark:bg-muted/80',
	},
};

interface PlaceholderContentEntry {
	key: string;
	block: ContentBlock;
}

function createPlaceholderContentEntries(params: {
	lessonId: string;
	lessonTitle: string;
}): readonly PlaceholderContentEntry[] {
	const occurrenceCounts = new Map<string, number>();
	const blocks = generatePlaceholderContent({
		seed: hashString(params.lessonId),
		topic: params.lessonTitle,
		minSections: 2,
		maxSections: 3,
		minParagraphsPerSection: 1,
		maxParagraphsPerSection: 2,
	});

	return blocks.map((block) => {
		const signature = `${block.type}-${hashString(block.content)}`;
		const occurrence = occurrenceCounts.get(signature) ?? 0;
		occurrenceCounts.set(signature, occurrence + 1);

		return {
			key: `${signature}-${occurrence}`,
			block,
		};
	});
}

function ContentBlockRenderer({ block }: { block: ContentBlock }) {
	switch (block.type) {
		case 'heading1':
			return (
				<h2 className="mb-4 text-xl font-bold text-stone-900 dark:text-stone-100">
					{block.content}
				</h2>
			);
		case 'heading2':
			return (
				<h3 className="mt-6 mb-3 text-lg font-semibold text-stone-800 dark:text-stone-200">
					{block.content}
				</h3>
			);
		case 'heading3':
			return (
				<h4 className="mt-4 mb-2 text-base font-medium text-stone-700 dark:text-stone-300">
					{block.content}
				</h4>
			);
		case 'paragraph':
			return (
				<p className="mb-4 leading-relaxed text-stone-600 dark:text-stone-400">
					{block.content}
				</p>
			);
		default: {
			// Compile-time exhaustiveness when ContentBlockType grows.
			const _exhaustiveCheck: never = block.type;
			return _exhaustiveCheck;
		}
	}
}

function LockedContentOverlay() {
	return (
		<div className="relative min-h-[300px] overflow-hidden rounded-xl border border-stone-200/50 dark:border-stone-700/50">
			{/* Fallback text layer - visible if blur is removed via dev tools */}
			<div className="absolute inset-0 flex items-center justify-center bg-stone-100 p-8 text-center dark:bg-stone-800">
				<div className="max-w-md">
					<Lock className="mx-auto mb-4 h-12 w-12 text-stone-400 dark:text-stone-500" />
					<p className="text-lg font-medium text-stone-500 dark:text-stone-400">
						This lesson is locked
					</p>
					<p className="mt-2 text-sm text-stone-400 dark:text-stone-500">
						Complete the previous lessons to unlock this content. Learning is
						most effective when you follow the structured path.
					</p>
				</div>
			</div>

			<div className="absolute inset-0 flex items-center justify-center bg-background/90 dark:bg-background/85">
				<div className="border-panel-border bg-panel text-panel-foreground max-w-sm rounded-2xl border p-8 text-center shadow-sm">
					<div className="mb-4 flex justify-center">
						<div className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100 dark:bg-stone-800">
							<Lock className="h-8 w-8 text-stone-400 dark:text-stone-500" />
						</div>
					</div>
					<h3 className="mb-2 text-lg font-semibold text-stone-700 dark:text-stone-300">
						Lesson Locked
					</h3>
					<p className="max-w-xs text-sm text-stone-500 dark:text-stone-400">
						Complete the previous lessons to unlock this content.
					</p>
				</div>
			</div>
		</div>
	);
}

export function LessonAccordionItem({
	lesson,
	status,
	onStatusChange,
	isLocked = false,
}: LessonAccordionItemProps): JSX.Element {
	const isCompleted = status === 'completed';
	const resources = lesson.resources ?? [];

	const placeholderContent = useMemo(
		() =>
			createPlaceholderContentEntries({
				lessonId: lesson.id,
				lessonTitle: lesson.title,
			}),
		[lesson.id, lesson.title],
	);

	const getCardClassName = () => {
		if (isLocked) {
			return 'border-stone-200/50 bg-stone-100/50 opacity-75 dark:border-stone-700/50 dark:bg-stone-800/30';
		}
		if (isCompleted) {
			return 'border-success/30 bg-success/5 dark:border-success/30 dark:bg-success/10';
		}
		return 'border-panel-border bg-panel shadow-sm hover:border-primary/30 hover:shadow-md dark:border-border';
	};

	return (
		<AccordionItem
			value={lesson.id}
			disabled={isLocked}
			className={`rounded-2xl border transition-all duration-300 ${getCardClassName()}`}
		>
			<AccordionTrigger
				hideChevron={false}
				className={`items-center px-6 py-4 hover:no-underline [&[data-state=open]>svg]:rotate-180 ${
					isLocked ? 'cursor-not-allowed' : ''
				}`}
			>
				<div className="flex-1 text-left">
					<div className="mb-2 flex items-center gap-3">
						<div
							className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
								isLocked
									? 'bg-stone-200 text-stone-400 dark:bg-stone-700 dark:text-stone-500'
									: isCompleted
										? 'bg-success text-success-foreground'
										: 'bg-primary/20 text-primary dark:bg-primary/20 dark:text-primary'
							}`}
						>
							{isLocked ? (
								<Lock className="h-4 w-4" />
							) : isCompleted ? (
								<CheckCircle2 className="h-5 w-5" />
							) : (
								<span className="text-sm font-semibold">{lesson.order}</span>
							)}
						</div>
						<h3
							className={`text-lg font-semibold ${
								isLocked
									? 'text-stone-400 dark:text-stone-500'
									: isCompleted
										? 'text-success dark:text-success'
										: 'text-stone-900 dark:text-stone-100'
							}`}
						>
							{lesson.title}
						</h3>
						{isLocked && (
							<Badge variant="secondary" className="border-transparent">
								Locked
							</Badge>
						)}
					</div>

					{lesson.description && (
						<p
							className={`mb-3 ml-11 text-sm leading-relaxed ${
								isLocked
									? 'text-stone-400 dark:text-stone-500'
									: 'text-stone-500 dark:text-stone-400'
							}`}
						>
							{lesson.description}
						</p>
					)}

					{resources.length > 0 && (
						<div
							className={`mb-3 ml-11 flex flex-wrap items-center gap-4 text-sm ${
								isLocked
									? 'text-stone-400 dark:text-stone-500'
									: 'text-stone-500 dark:text-stone-400'
							}`}
						>
							<span className="inline-flex items-center gap-1.5">
								<LinkIcon className="h-4 w-4" />
								{resources.length} resource
								{resources.length !== 1 ? 's' : ''}
							</span>
						</div>
					)}
				</div>

				<span
					className={`flex shrink-0 items-center text-sm ${
						isLocked
							? 'text-stone-400 dark:text-stone-500'
							: 'text-stone-500 dark:text-stone-400'
					}`}
				>
					<span className="inline-flex items-center gap-1.5">
						<Clock className="h-4 w-4" />
						{formatMinutes(lesson.estimatedMinutes)}
					</span>
				</span>
			</AccordionTrigger>

			<AccordionContent className="px-6 pb-6">
				<div className="border-t border-stone-200/50 pt-6 dark:border-stone-700/50">
					{isLocked ? (
						<LockedContentOverlay />
					) : (
						<>
							{resources.length > 0 && (
								<div className="mb-6">
									<h4 className="mb-3 text-sm font-medium text-stone-700 dark:text-stone-300">
										Learning Resources
									</h4>
									<div className="grid gap-3 sm:grid-cols-2">
										{resources.map((taskResource) => {
											const resource = taskResource.resource;
											const config = RESOURCE_CONFIG[resource.type];
											const Icon = config.icon;

											return (
												<a
													key={taskResource.id}
													href={resource.url}
													target="_blank"
													rel="noopener noreferrer"
													className="group/resource border-panel-border bg-panel hover:border-primary/30 flex items-start gap-3 rounded-xl border p-4 shadow-sm transition-all hover:shadow-md dark:hover:border-primary/30"
												>
													<div
														className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${config.badgeClass}`}
													>
														<Icon className="h-5 w-5" />
													</div>
													<div className="min-w-0 flex-1">
														<div className="mb-1 flex items-center gap-2">
															<span className="group-hover/resource:text-primary dark:group-hover/resource:text-primary truncate font-medium text-stone-800 dark:text-stone-200">
																{resource.title}
															</span>
															<ExternalLink className="h-3 w-3 shrink-0 opacity-50" />
														</div>
														<div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
															<Badge
																className={`rounded border-transparent px-1.5 ${config.badgeClass}`}
															>
																{config.label}
															</Badge>
															{resource.durationMinutes && (
																<span>
																	{formatMinutes(resource.durationMinutes)}
																</span>
															)}
														</div>
														{taskResource.notes && (
															<p className="mt-2 text-xs text-stone-500 dark:text-stone-400">
																{taskResource.notes}
															</p>
														)}
													</div>
												</a>
											);
										})}
									</div>
								</div>
							)}

							<div className="rounded-xl border border-stone-200/50 bg-white/50 p-6 dark:border-stone-700/50 dark:bg-stone-800/30">
								<div className="prose prose-stone dark:prose-invert max-w-none">
									{placeholderContent.map(({ key, block }) => (
										<ContentBlockRenderer key={key} block={block} />
									))}
								</div>

								<div className="mt-6 rounded-lg bg-amber-50/50 p-3 text-center text-xs text-amber-700 dark:bg-amber-950/20 dark:text-amber-400">
									This content is placeholder text. AI-generated learning
									material will appear here.
								</div>
							</div>

							<div className="mt-6 flex justify-end">
								<TaskStatusButton
									taskId={lesson.id}
									status={status}
									onStatusChange={onStatusChange}
								/>
							</div>
						</>
					)}
				</div>
			</AccordionContent>
		</AccordionItem>
	);
}
