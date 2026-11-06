use std::{
    collections::{HashMap, VecDeque},
    process::Child,
    sync::{Arc, Condvar, Mutex},
};

#[derive(Default)]
pub struct Job {
    pub child: Option<Child>,
    pub cancelled: bool,
    pub committing: bool,
    pub asset_id: String,
    pub model_id: String,
    pub scale: u32,
}

pub struct JobInfo {
    pub id: String,
    pub state: &'static str,
    pub asset_id: String,
    pub model_id: String,
    pub scale: u32,
}

struct State {
    limit: usize,
    running: usize,
    queue: VecDeque<String>,
    jobs: HashMap<String, Arc<Mutex<Job>>>,
    cancelled: VecDeque<String>,
}

pub struct Scheduler {
    state: Mutex<State>,
    changed: Condvar,
}

impl Default for Scheduler {
    fn default() -> Self {
        Self {
            state: Mutex::new(State {
                limit: 1,
                running: 0,
                queue: VecDeque::new(),
                jobs: HashMap::new(),
                cancelled: VecDeque::new(),
            }),
            changed: Condvar::new(),
        }
    }
}

impl Scheduler {
    pub fn configure(&self, limit: usize) -> Result<(), String> {
        if !(1..=16).contains(&limit) {
            return Err("Concurrency must be between 1 and 16".into());
        }
        self.state.lock().map_err(|e| e.to_string())?.limit = limit;
        self.changed.notify_all();
        Ok(())
    }

    pub fn register(&self, id: &str, asset_id: &str, model_id: &str, scale: u32) -> Result<Arc<Mutex<Job>>, String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        if state.jobs.contains_key(id) {
            return Err("Upscale task ID is already active".into());
        }
        let cancelled = state.cancelled.iter().any(|entry| entry == id);
        state.cancelled.retain(|entry: &String| entry != id);
        let job = Arc::new(Mutex::new(Job {
            cancelled,
            asset_id: asset_id.into(),
            model_id: model_id.into(),
            scale,
            ..Job::default()
        }));
        state.jobs.insert(id.into(), job.clone());
        state.queue.push_back(id.into());
        Ok(job)
    }

    pub fn acquire(&self, id: &str, job: &Arc<Mutex<Job>>) -> Result<(), String> {
        let mut state = self.state.lock().map_err(|e| e.to_string())?;
        loop {
            if job.lock().map_err(|e| e.to_string())?.cancelled {
                state.queue.retain(|entry| entry != id);
                state.jobs.remove(id);
                self.changed.notify_all();
                return Err("cancelled".into());
            }
            if state.running < state.limit && state.queue.front().is_some_and(|entry| entry == id) {
                state.queue.pop_front();
                state.running += 1;
                self.changed.notify_all();
                return Ok(());
            }
            state = self.changed.wait(state).map_err(|e| e.to_string())?;
        }
    }

    pub fn release(&self, id: &str) {
        if let Ok(mut state) = self.state.lock() {
            state.running = state.running.saturating_sub(1);
            if let Some(job) = state.jobs.remove(id) {
                if let Ok(mut task) = job.lock() {
                    if let Some(child) = task.child.as_mut() {
                        let _ = child.kill();
                        let _ = child.wait();
                    }
                }
            }
        }
        self.changed.notify_all();
    }

    pub fn cancel(&self, id: &str) -> Result<bool, String> {
        let job = {
            let mut state = self.state.lock().map_err(|e| e.to_string())?;
            if let Some(job) = state.jobs.get(id) {
                Some(job.clone())
            } else {
                // A cancel invocation may overtake an async registration.
                state.cancelled.push_back(id.into());
                if state.cancelled.len() > 1024 {
                    state.cancelled.pop_front();
                }
                None
            }
        };
        let Some(job) = job else {
            return Ok(true);
        };
        let mut job = job.lock().map_err(|e| e.to_string())?;
        if job.committing {
            return Ok(false);
        }
        job.cancelled = true;
        if let Some(child) = job.child.as_mut() {
            child.kill().map_err(|e| e.to_string())?;
        }
        self.changed.notify_all();
        Ok(true)
    }

    pub fn shutdown(&self) {
        let ids = self
            .state
            .lock()
            .map(|s| s.jobs.keys().cloned().collect::<Vec<_>>())
            .unwrap_or_default();
        for id in ids {
            let _ = self.cancel(&id);
        }
    }

    pub fn is_busy(&self) -> bool {
        self.state.lock().map(|s| !s.jobs.is_empty()).unwrap_or(true)
    }

    pub fn snapshot(&self) -> Result<Vec<JobInfo>, String> {
        let state = self.state.lock().map_err(|e| e.to_string())?;
        let describe = |id: &str, job: &Job, queued: bool| JobInfo {
            id: id.to_string(),
            state: if job.committing {
                "committing"
            } else if job.cancelled {
                "cancelling"
            } else if queued {
                "queued"
            } else {
                "running"
            },
            asset_id: job.asset_id.clone(),
            model_id: job.model_id.clone(),
            scale: job.scale,
        };
        let mut jobs = Vec::new();
        for (id, job) in &state.jobs {
            if state.queue.contains(id) {
                continue;
            }
            let job = job.lock().map_err(|e| e.to_string())?;
            jobs.push(describe(id, &job, false));
        }
        for id in &state.queue {
            if let Some(job) = state.jobs.get(id) {
                let job = job.lock().map_err(|e| e.to_string())?;
                jobs.push(describe(id, &job, true));
            }
        }
        Ok(jobs)
    }
}

pub struct Lease<'a>(pub &'a Scheduler, pub String);
impl Drop for Lease<'_> {
    fn drop(&mut self) {
        self.0.release(&self.1);
    }
}
