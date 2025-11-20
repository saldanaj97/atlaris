-- Enable RLS on all tables (NOT force RLS to allow BYPASSRLS to work in tests)
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE learning_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE modules ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE plan_generations ENABLE ROW LEVEL SECURITY;
ALTER TABLE task_resources ENABLE ROW LEVEL SECURITY;

-- Drop existing policies with NULL conditions
DROP POLICY IF EXISTS users_select_own ON users;
DROP POLICY IF EXISTS users_insert_own ON users;
DROP POLICY IF EXISTS users_update_own ON users;

DROP POLICY IF EXISTS learning_plans_select ON learning_plans;
DROP POLICY IF EXISTS learning_plans_insert ON learning_plans;
DROP POLICY IF EXISTS learning_plans_update ON learning_plans;
DROP POLICY IF EXISTS learning_plans_delete ON learning_plans;

DROP POLICY IF EXISTS modules_select_own_plan ON modules;
DROP POLICY IF EXISTS modules_select_public_anon ON modules;
DROP POLICY IF EXISTS modules_select_public_auth ON modules;
DROP POLICY IF EXISTS modules_insert_own_plan ON modules;
DROP POLICY IF EXISTS modules_update_own_plan ON modules;
DROP POLICY IF EXISTS modules_delete_own_plan ON modules;

DROP POLICY IF EXISTS tasks_select_own_plan ON tasks;
DROP POLICY IF EXISTS tasks_select_public_anon ON tasks;
DROP POLICY IF EXISTS tasks_select_public_auth ON tasks;
DROP POLICY IF EXISTS tasks_insert_own_plan ON tasks;
DROP POLICY IF EXISTS tasks_update_own_plan ON tasks;
DROP POLICY IF EXISTS tasks_delete_own_plan ON tasks;

DROP POLICY IF EXISTS task_progress_select_own ON task_progress;
DROP POLICY IF EXISTS task_progress_insert_own ON task_progress;
DROP POLICY IF EXISTS task_progress_update_own ON task_progress;
DROP POLICY IF EXISTS task_progress_delete_own ON task_progress;

DROP POLICY IF EXISTS resources_select_anon ON resources;
DROP POLICY IF EXISTS resources_select_auth ON resources;

-- Create users table policies
CREATE POLICY users_select_own ON users
  FOR SELECT
  USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY users_insert_own ON users
  FOR INSERT
  WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

CREATE POLICY users_update_own ON users
  FOR UPDATE
  USING (clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub'))
  WITH CHECK (clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub'));

-- Create learning_plans table policies
CREATE POLICY learning_plans_select ON learning_plans
  FOR SELECT
  USING (
    visibility = 'public' OR
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY learning_plans_insert ON learning_plans
  FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY learning_plans_update ON learning_plans
  FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY learning_plans_delete ON learning_plans
  FOR DELETE
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

-- Create modules table policies
CREATE POLICY modules_select_own_plan ON modules
  FOR SELECT
  USING (
    plan_id IN (
      SELECT id FROM learning_plans
      WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY modules_select_public_anon ON modules
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::text IS NULL OR current_setting('request.jwt.claims', true)::text = 'null')
    AND plan_id IN (SELECT id FROM learning_plans WHERE visibility = 'public')
  );

CREATE POLICY modules_select_public_auth ON modules
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'sub') IS NOT NULL
    AND plan_id IN (SELECT id FROM learning_plans WHERE visibility = 'public')
  );

CREATE POLICY modules_insert_own_plan ON modules
  FOR INSERT
  WITH CHECK (
    plan_id IN (
      SELECT id FROM learning_plans
      WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY modules_update_own_plan ON modules
  FOR UPDATE
  USING (
    plan_id IN (
      SELECT id FROM learning_plans
      WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  )
  WITH CHECK (
    plan_id IN (
      SELECT id FROM learning_plans
      WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY modules_delete_own_plan ON modules
  FOR DELETE
  USING (
    plan_id IN (
      SELECT id FROM learning_plans
      WHERE user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

-- Create tasks table policies
CREATE POLICY tasks_select_own_plan ON tasks
  FOR SELECT
  USING (
    module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY tasks_select_public_anon ON tasks
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::text IS NULL OR current_setting('request.jwt.claims', true)::text = 'null')
    AND module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.visibility = 'public'
    )
  );

CREATE POLICY tasks_select_public_auth ON tasks
  FOR SELECT
  USING (
    (current_setting('request.jwt.claims', true)::json->>'sub') IS NOT NULL
    AND module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.visibility = 'public'
    )
  );

CREATE POLICY tasks_insert_own_plan ON tasks
  FOR INSERT
  WITH CHECK (
    module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY tasks_update_own_plan ON tasks
  FOR UPDATE
  USING (
    module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  )
  WITH CHECK (
    module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

CREATE POLICY tasks_delete_own_plan ON tasks
  FOR DELETE
  USING (
    module_id IN (
      SELECT m.id FROM modules m
      JOIN learning_plans lp ON m.plan_id = lp.id
      WHERE lp.user_id IN (
        SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
      )
    )
  );

-- Create task_progress table policies
CREATE POLICY task_progress_select_own ON task_progress
  FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY task_progress_insert_own ON task_progress
  FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY task_progress_update_own ON task_progress
  FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  )
  WITH CHECK (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

CREATE POLICY task_progress_delete_own ON task_progress
  FOR DELETE
  USING (
    user_id IN (
      SELECT id FROM users WHERE clerk_user_id = (current_setting('request.jwt.claims', true)::json->>'sub')
    )
  );

-- Create resources table policies (read-only for all)
CREATE POLICY resources_select_anon ON resources
  FOR SELECT
  USING (true);

CREATE POLICY resources_select_auth ON resources
  FOR SELECT
  USING (true);
