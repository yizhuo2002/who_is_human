"""
Multi-Agent Orchestration for "Who is Human" Game
Replaces HostAgent.ts logic with HuggingFace smolagents pattern
"""

import asyncio
import json
from typing import Optional, Callable, Any
from dataclasses import dataclass, asdict

try:
    from smolagents import CodeAgent, tool
    from smolagents.models import InferenceClientModel
except ImportError:
    raise ImportError(
        "Please install smolagents: pip install 'smolagents[litellm]' aiohttp"
    )


@dataclass
class PhaseDurations:
    """Game phase timing configuration"""
    round_start_ms: int = 300
    discuss_ms: int = 30_000
    warning_ms: int = 10_000
    vote_ms: int = 15_000


@dataclass
class GameEvent:
    """Events broadcast from the orchestrator"""
    type: str  # "phase", "message", "notice", "result"
    data: dict

    def to_json(self) -> str:
        return json.dumps({"type": self.type, **self.data})


class DiscussionTools:
    """Tools available to AI agents during discussion phase"""

    def __init__(self, game_context: dict):
        self.game_context = game_context

    @tool
    def analyze_human_statement(self, text: str) -> str:
        """
        Analyze the human's statement for logical consistency and behavioral patterns.
        Returns analysis that helps identify if they're human.
        """
        # This would integrate with your LLM to analyze the statement
        analysis = f"Statement analysis for: '{text}'"
        return analysis

    @tool
    def propose_elimination(self, player_id: str, reason: str) -> str:
        """
        Propose a player for elimination with reasoning
        """
        return f"Propose eliminating {player_id} because: {reason}"

    @tool
    def request_clarification(self, player_id: str, question: str) -> str:
        """
        Ask another player a clarification question
        """
        return f"Question to {player_id}: {question}"


class AIAgentWrapper:
    """
    Wrapper for individual AI agents using smolagents
    Represents a single AI player in the game
    """

    def __init__(
        self,
        agent_id: str,
        name: str,
        persona: str,
        model_id: str = "Qwen/Qwen2.5-Coder-32B-Instruct",
        provider: str = "together",
    ):
        self.agent_id = agent_id
        self.name = name
        self.persona = persona

        # Initialize the smolagents CodeAgent
        self.model = InferenceClientModel(model_id=model_id, provider=provider)
        self.agent = CodeAgent(
            model=self.model,
            tools=[],  # Will add game-specific tools dynamically
            name=name,
            description=f"Game AI player: {persona}",
            verbosity_level=0,
            max_steps=5,
        )

    async def speak(self, context: str) -> str:
        """
        Generate a response in the discussion phase
        Uses the agent to reason about the context and generate a response
        """
        prompt = f"""You are {self.name}.
Your personality: {self.persona}

Current game context:
{context}

Generate a natural, brief response (1-2 sentences) that sounds human-like and stays in character."""

        try:
            result = await asyncio.to_thread(self.agent.run, prompt)
            return str(result)
        except Exception as e:
            # Fallback response on error
            return f"I think that's an interesting point. Let me think about it."


class HostAgentOrchestrator:
    """
    Main orchestrator replacing HostAgent.ts
    Manages game flow, coordinates AI agents, and broadcasts events
    
    Uses HuggingFace smolagents multi-agent pattern:
    - Manager Agent: oversees game state and decision-making
    - Discussion Agents: individual AI players
    - Coordination: via message passing and tool calls
    """

    def __init__(
        self,
        game_id: str,
        game_state_getter: Callable[[str], dict],
        broadcast_callback: Callable[[GameEvent], None],
        durations: Optional[PhaseDurations] = None,
        model_id: str = "Qwen/Qwen2.5-Coder-32B-Instruct",
        provider: str = "together",
    ):
        self.game_id = game_id
        self.get_game_state = game_state_getter
        self.broadcast = broadcast_callback
        self.durations = durations or PhaseDurations()
        self.running = False
        self.timers: list[asyncio.Task] = []

        # Initialize manager agent for orchestration
        self.model = InferenceClientModel(model_id=model_id, provider=provider)
        
        # Create the manager agent that oversees the game
        self.manager_agent = CodeAgent(
            model=self.model,
            tools=[self._create_game_control_tools()],
            name="GameOrchestrator",
            description="Manages game flow and AI agent coordination",
            verbosity_level=1,
            max_steps=10,
        )

        # Dictionary to store AI agents by player ID
        self.ai_agents: dict[str, AIAgentWrapper] = {}

    def _create_game_control_tools(self):
        """Create tools the manager agent can use to control the game"""

        @tool
        def get_game_state() -> str:
            """Get current game state"""
            state = self.get_game_state(self.game_id)
            return json.dumps(state, indent=2)

        @tool
        def broadcast_event(event_type: str, event_data: dict) -> str:
            """Broadcast an event to all players"""
            event = GameEvent(type=event_type, data=event_data)
            self.broadcast(event)
            return f"Event broadcasted: {event_type}"

        @tool
        def coordinate_discussion(round_num: int) -> str:
            """Coordinate the discussion phase - trigger all AI agents to speak"""
            return f"Discussion coordination for round {round_num}"

        return {
            "get_game_state": get_game_state,
            "broadcast_event": broadcast_event,
            "coordinate_discussion": coordinate_discussion,
        }

    def register_ai_agent(
        self,
        agent_id: str,
        name: str,
        persona: str,
    ) -> AIAgentWrapper:
        """
        Register an AI agent with the orchestrator
        Called during game setup
        """
        agent = AIAgentWrapper(
            agent_id=agent_id,
            name=name,
            persona=persona,
        )
        self.ai_agents[agent_id] = agent
        return agent

    async def stop(self):
        """Stop the orchestrator and cancel all pending timers"""
        self.running = False
        for timer in self.timers:
            timer.cancel()
        self.timers.clear()

    async def start(self):
        """Start the main game loop"""
        if self.running:
            return
        self.running = True
        await self._game_loop()

    async def _sleep(self, ms: int):
        """Sleep for milliseconds, storing the task for cleanup"""
        task = asyncio.create_task(asyncio.sleep(ms / 1000.0))
        self.timers.append(task)
        try:
            await task
        except asyncio.CancelledError:
            pass

    async def _set_timer(self, ms: int, callback: Callable):
        """Set a timer that calls a callback after ms milliseconds"""
        async def _timer():
            try:
                await asyncio.sleep(ms / 1000.0)
                await callback() if asyncio.iscoroutinefunction(callback) else callback()
            except asyncio.CancelledError:
                pass

        task = asyncio.create_task(_timer())
        self.timers.append(task)

    async def _game_loop(self):
        """
        Main game orchestration loop
        Coordinates timing, phase transitions, and agent interactions
        """
        while self.running:
            game_state = self.get_game_state(self.game_id)

            if game_state["phase"] == "END":
                self.running = False
                break

            if game_state["phase"] == "ROUND_START":
                await self._handle_round_start(game_state)

            elif game_state["phase"] == "DISCUSS":
                await self._handle_discussion(game_state)

            elif game_state["phase"] == "SUMMARY":
                await self._handle_summary(game_state)

            elif game_state["phase"] == "VOTE":
                await self._handle_voting(game_state)

            else:
                # Brief pause before checking again
                await self._sleep(100)

    async def _handle_round_start(self, game_state: dict):
        """Handle round start phase"""
        self.broadcast(
            GameEvent(
                type="phase",
                data={"phase": "ROUND_START", "round": game_state["round"]},
            )
        )

        # Host announces rules
        rules_message = (
            "Rules: 3 rounds of discussion → summary → voting. "
            "Win if 2 AIs are eliminated within 2 rounds. "
            "Lose if the human is eliminated."
        )
        self.broadcast(
            GameEvent(
                type="message",
                data={
                    "playerId": "host",
                    "round": game_state["round"],
                    "text": rules_message,
                },
            )
        )

        # Move to discussion phase
        await self._sleep(self.durations.round_start_ms)

    async def _handle_discussion(self, game_state: dict):
        """
        Handle discussion phase
        Coordinates multiple AI agents to respond to the human's input
        """
        self.broadcast(
            GameEvent(
                type="phase",
                data={"phase": "DISCUSS", "round": game_state["round"]},
            )
        )

        # Get the last human message
        messages = game_state.get("messages", [])
        last_human_message = next(
            (m for m in reversed(messages) if m["playerId"].startswith("u-")), None
        )

        if last_human_message:
            # Coordinate all AI agents to respond in parallel
            tasks = []
            for agent_id, agent_wrapper in self.ai_agents.items():
                context = f"Human said in round {game_state['round']}: \"{last_human_message['text']}\""
                tasks.append(self._get_agent_response(agent_wrapper, context))

            # Wait for all AI responses
            responses = await asyncio.gather(*tasks)

            # Broadcast each response
            for (agent_id, agent_wrapper), response in zip(self.ai_agents.items(), responses):
                self.broadcast(
                    GameEvent(
                        type="message",
                        data={
                            "playerId": agent_id,
                            "round": game_state["round"],
                            "text": response,
                        },
                    )
                )

        # Set warning timer
        async def _warn():
            self.broadcast(
                GameEvent(
                    type="notice",
                    data={"text": "⏳ Discussion almost over"},
                )
            )

        await self._set_timer(
            self.durations.discuss_ms - self.durations.warning_ms, _warn
        )

        # Wait for discussion to end
        await self._sleep(self.durations.discuss_ms)

    async def _get_agent_response(self, agent_wrapper: AIAgentWrapper, context: str) -> str:
        """Get a response from a specific AI agent"""
        try:
            response = await agent_wrapper.speak(context)
            return response
        except Exception as e:
            print(f"Error getting response from {agent_wrapper.name}: {e}")
            return "I need to think about that for a moment."

    async def _handle_summary(self, game_state: dict):
        """Handle summary phase"""
        self.broadcast(
            GameEvent(
                type="phase",
                data={"phase": "SUMMARY", "round": game_state["round"]},
            )
        )

        summary_text = f"Round {game_state['round']} summary: please vote on who you think is the AI."
        self.broadcast(
            GameEvent(
                type="message",
                data={
                    "playerId": "host",
                    "round": game_state["round"],
                    "text": summary_text,
                },
            )
        )

    async def _handle_voting(self, game_state: dict):
        """Handle voting phase and results"""
        self.broadcast(
            GameEvent(
                type="phase",
                data={"phase": "VOTE", "round": game_state["round"]},
            )
        )

        # Wait for voting window
        await self._sleep(self.durations.vote_ms)

        # Game result is handled by TypeScript resolver


# Async context manager for clean orchestrator lifecycle
class OrchestrationContext:
    """Context manager for orchestrator lifecycle"""

    def __init__(self, orchestrator: HostAgentOrchestrator):
        self.orchestrator = orchestrator

    async def __aenter__(self):
        return self.orchestrator

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self.orchestrator.stop()


# Export main components
__all__ = [
    "HostAgentOrchestrator",
    "AIAgentWrapper",
    "PhaseDurations",
    "GameEvent",
    "OrchestrationContext",
    "DiscussionTools",
]