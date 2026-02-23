import { factories } from '@strapi/strapi';
import crypto from 'crypto';

// Type for populated survey data
interface SurveyData {
  id: number;
  documentId: string;
  title: string;
  description?: string;
  isAnonymous: boolean;
  status: 'draft' | 'active' | 'closed';
  publicToken: string;
  expiresAt?: string;
  thankYouMessage?: string;
  showProgressBar: boolean;
  allowMultipleResponses: boolean;
  questions?: any[];
  responses?: any[];
  project?: {
    id: number;
    documentId: string;
    title: string;
  };
  createdBy?: any;
  createdAt?: string;
}

export default factories.createCoreController('api::project-survey.project-survey', ({ strapi }) => ({
  async create(ctx) {
    const user = ctx.state.user;
    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    // Generate unique public token
    const publicToken = crypto.randomBytes(16).toString('hex');
    
    const requestData = ctx.request.body.data || {};
    
    // Handle project relation - convert documentId to connect format
    let projectRelation = undefined;
    if (requestData.project) {
      // If it's a documentId string, use connect
      if (typeof requestData.project === 'string') {
        projectRelation = { connect: [requestData.project] };
      } else {
        projectRelation = requestData.project;
      }
    }

    // createdBy is set via lifecycle hook
    ctx.request.body.data = {
      ...requestData,
      project: projectRelation,
      publicToken,
    };

    try {
      const response = await super.create(ctx);
      return response;
    } catch (error: any) {
      console.error('Survey create error:', error.message, error.details);
      throw error;
    }
  },

  // Get survey by public token (no auth required)
  async findByToken(ctx) {
    const { token } = ctx.params;

    const surveys = await strapi.entityService.findMany('api::project-survey.project-survey', {
      filters: { publicToken: token },
      populate: ['questions', 'project'],
    });

    if (!surveys || surveys.length === 0) {
      return ctx.notFound('Survey not found');
    }

    const surveyData = surveys[0] as unknown as SurveyData;

    // Check if survey is active
    if (surveyData.status !== 'active') {
      return ctx.badRequest('This survey is not currently active');
    }

    // Check expiration
    if (surveyData.expiresAt && new Date(surveyData.expiresAt) < new Date()) {
      return ctx.badRequest('This survey has expired');
    }

    // Return sanitized survey data for public
    return {
      data: {
        id: surveyData.id,
        documentId: surveyData.documentId,
        title: surveyData.title,
        description: surveyData.description,
        isAnonymous: surveyData.isAnonymous,
        questions: surveyData.questions || [],
        showProgressBar: surveyData.showProgressBar,
        thankYouMessage: surveyData.thankYouMessage,
        projectTitle: surveyData.project?.title,
      },
    };
  },

  // Submit response to survey (no auth required)
  async submitResponse(ctx) {
    console.log('submitResponse called with token:', ctx.params.token);
    console.log('Request body:', JSON.stringify(ctx.request.body));
    
    const { token } = ctx.params;
    const { answers, respondentName, respondentPosition, respondentDepartment, respondentEmail, completionTime } = ctx.request.body;

    const surveys = await strapi.entityService.findMany('api::project-survey.project-survey', {
      filters: { publicToken: token },
      populate: ['questions', 'responses'],
    });

    if (!surveys || surveys.length === 0) {
      return ctx.notFound('Survey not found');
    }

    const surveyData = surveys[0] as unknown as SurveyData;
    console.log('Survey found:', surveyData.title, 'Status:', surveyData.status);

    // Validations
    if (surveyData.status !== 'active') {
      console.log('Survey not active, status is:', surveyData.status);
      return ctx.badRequest('This survey is not currently active');
    }

    if (surveyData.expiresAt && new Date(surveyData.expiresAt) < new Date()) {
      return ctx.badRequest('This survey has expired');
    }

    // Get client IP
    const forwardedFor = ctx.request.headers['x-forwarded-for'];
    const clientIp: string = ctx.request.ip || 
      (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor) || 
      'unknown';

    // Check for duplicate responses if not allowed
    if (!surveyData.allowMultipleResponses) {
      const existingResponse = await strapi.entityService.findMany('api::survey-response.survey-response', {
        filters: {
          survey: { id: surveyData.id },
          ipAddress: clientIp,
        },
      });

      if (existingResponse && existingResponse.length > 0) {
        return ctx.badRequest('You have already submitted a response to this survey');
      }
    }

    // Create response using entityService - use numeric ID for relations
    try {
      console.log('Creating survey response with survey id:', surveyData.id);
      
      // Build response data, only include email if it's a valid non-empty string
      const responseData: any = {
        survey: surveyData.id,
        answers,
        respondentName: surveyData.isAnonymous ? null : (respondentName || null),
        respondentPosition: surveyData.isAnonymous ? null : (respondentPosition || null),
        respondentDepartment: surveyData.isAnonymous ? null : (respondentDepartment || null),
        isAnonymous: surveyData.isAnonymous,
        ipAddress: clientIp,
        userAgent: ctx.request.headers['user-agent'] || 'unknown',
        completionTime,
      };
      
      // Only add respondentEmail if it's a valid non-empty string
      if (!surveyData.isAnonymous && respondentEmail && respondentEmail.trim()) {
        responseData.respondentEmail = respondentEmail;
      }
      
      await strapi.entityService.create('api::survey-response.survey-response', {
        data: responseData,
      });
      console.log('Survey response created successfully');
    } catch (error: any) {
      console.error('Error creating survey response:', error.message, error.details);
      return ctx.badRequest('Failed to save response: ' + error.message);
    }

    return {
      data: {
        success: true,
        message: surveyData.thankYouMessage || 'Спасибо за участие в опросе!',
      },
    };
  },

  // Get survey results with aggregated statistics
  async getResults(ctx) {
    const { id } = ctx.params;
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const survey = await strapi.entityService.findOne('api::project-survey.project-survey', id, {
      populate: ['questions', 'responses', 'project', 'createdBy'],
    }) as unknown as SurveyData | null;

    if (!survey) {
      return ctx.notFound('Survey not found');
    }

    // Calculate statistics
    const responses = survey.responses || [];
    const questions = survey.questions || [];

    const statistics = questions.map((question: any) => {
      const questionAnswers = responses.map((r: any) => r.answers?.[question.id]).filter(Boolean);

      let stats: any = {
        questionId: question.id,
        questionText: question.text,
        questionType: question.type,
        totalAnswers: questionAnswers.length,
      };

      switch (question.type) {
        case 'single_choice':
        case 'multiple_choice':
          const optionCounts: Record<string, number> = {};
          questionAnswers.forEach((answer: any) => {
            if (Array.isArray(answer)) {
              answer.forEach((a: string) => {
                optionCounts[a] = (optionCounts[a] || 0) + 1;
              });
            } else {
              optionCounts[answer] = (optionCounts[answer] || 0) + 1;
            }
          });
          stats.optionCounts = optionCounts;
          stats.options = question.options;
          break;

        case 'rating':
          const ratings = questionAnswers.map((a: any) => Number(a)).filter((n: number) => !isNaN(n));
          stats.average = ratings.length > 0 ? (ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length).toFixed(2) : 0;
          stats.distribution = {};
          ratings.forEach((r: number) => {
            stats.distribution[r] = (stats.distribution[r] || 0) + 1;
          });
          break;

        case 'yes_no':
          const yesCount = questionAnswers.filter((a: any) => a === 'yes' || a === true).length;
          const noCount = questionAnswers.filter((a: any) => a === 'no' || a === false).length;
          stats.yesCount = yesCount;
          stats.noCount = noCount;
          stats.yesPercent = questionAnswers.length > 0 ? ((yesCount / questionAnswers.length) * 100).toFixed(1) : 0;
          break;

        case 'text':
          stats.textAnswers = questionAnswers;
          break;
      }

      return stats;
    });

    // Individual responses (for detailed view)
    const individualResponses = responses.map((r: any) => ({
      id: r.id,
      documentId: r.documentId,
      respondentName: r.respondentName,
      respondentPosition: r.respondentPosition,
      respondentDepartment: r.respondentDepartment,
      respondentEmail: r.respondentEmail,
      isAnonymous: r.isAnonymous,
      answers: r.answers,
      completionTime: r.completionTime,
      createdAt: r.createdAt,
    }));

    return {
      data: {
        survey: {
          id: survey.id,
          documentId: survey.documentId,
          title: survey.title,
          description: survey.description,
          status: survey.status,
          isAnonymous: survey.isAnonymous,
          publicToken: survey.publicToken,
          expiresAt: survey.expiresAt,
          createdAt: survey.createdAt,
          projectTitle: survey.project?.title,
        },
        totalResponses: responses.length,
        statistics,
        individualResponses,
      },
    };
  },

  // Toggle survey status
  async toggleStatus(ctx) {
    const { id } = ctx.params;
    const { status } = ctx.request.body;
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const survey = await strapi.entityService.findOne('api::project-survey.project-survey', id);

    if (!survey) {
      return ctx.notFound('Survey not found');
    }

    const updated = await strapi.entityService.update('api::project-survey.project-survey', id, {
      data: { status },
    });

    return { data: updated };
  },

  // Duplicate survey
  async duplicate(ctx) {
    const { id } = ctx.params;
    const user = ctx.state.user;

    if (!user) {
      return ctx.unauthorized('You must be logged in');
    }

    const survey = await strapi.entityService.findOne('api::project-survey.project-survey', id, {
      populate: ['questions', 'project'],
    }) as unknown as SurveyData | null;

    if (!survey) {
      return ctx.notFound('Survey not found');
    }

    const publicToken = crypto.randomBytes(16).toString('hex');

    // Use numeric IDs for entityService
    const newSurvey = await strapi.entityService.create('api::project-survey.project-survey', {
      data: {
        title: `${survey.title} (копия)`,
        description: survey.description,
        project: survey.project?.id || null,
        isAnonymous: survey.isAnonymous,
        status: 'draft' as const,
        publicToken,
        thankYouMessage: survey.thankYouMessage,
        questions: survey.questions || [],
        allowMultipleResponses: survey.allowMultipleResponses,
        showProgressBar: survey.showProgressBar,
        // createdBy will be set by lifecycle hook from request context
      } as any,
    });

    return { data: newSurvey };
  },
}));
